import { beforeEach, describe, expect, it } from 'vitest';
import { ReplyHandler } from '../replyHandler.js';
import { MockProvider } from '../../providers/mock.js';
import type { ParsedReply } from '../../mail/reader.js';
import {
  ensureConversation,
  getConversationByJid,
  listMessages,
  listInboundEmails,
  upsertContact
} from '../../store.js';
import { applyTestSettings, prepareDatabase } from '../../../test/helpers.js';

const CHAT = '5511999999999@s.whatsapp.net';
let token = '';

function makeReply(overrides: Partial<ParsedReply> = {}): ParsedReply {
  return {
    messageId: `<reply-${Math.random().toString(36).slice(2)}@exemplo.com>`,
    inReplyTo: null,
    references: [],
    from: 'Dono <dono@example.com>',
    recipients: [`conv+${token}@example.com`],
    subject: '[WhatsRouter] WhatsApp - Maria (5511999999999)',
    text: 'Pode confirmar para amanha?\n\nEm 1 de janeiro, WhatsRouter escreveu:\n> ola',
    attachments: [],
    date: new Date(),
    uid: 1,
    ...overrides
  };
}

describe('resposta por e-mail vira mensagem no WhatsApp', () => {
  let provider: MockProvider;
  let handler: ReplyHandler;

  beforeEach(() => {
    prepareDatabase();
    applyTestSettings();
    const contact = upsertContact({ jid: CHAT, phone: '5511999999999', name: 'Maria', isGroup: false });
    const conversation = ensureConversation({ jid: CHAT, kind: 'dm', contactId: contact.id, title: 'Maria' });
    token = conversation.token;
    provider = new MockProvider();
    handler = new ReplyHandler(() => provider);
  });

  it('identifica a conversa pelo token e envia o texto limpo', async () => {
    await handler.handle(makeReply());

    const sent = provider.sentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(CHAT);
    expect(sent[0]?.content.text).toBe('Pode confirmar para amanha?');

    const conversation = getConversationByJid(CHAT)!;
    const outbound = listMessages(conversation.id).filter((message) => message.direction === 'out');
    expect(outbound[0]?.source).toBe('email');

    const emails = listInboundEmails(10);
    expect(emails[0]?.status).toBe('processed');
  });

  it('identifica a conversa pelos cabecalhos de thread quando o token nao existe', async () => {
    const conversation = getConversationByJid(CHAT)!;
    const { setConversationEmailMessageId } = await import('../../store.js');
    setConversationEmailMessageId(conversation.id, '<anterior@example.com>');

    await handler.handle(
      makeReply({
        recipients: ['bot@example.com'],
        inReplyTo: '<anterior@example.com>',
        references: ['<anterior@example.com>']
      })
    );

    expect(provider.sentMessages()).toHaveLength(1);
  });

  it('registra como nao roteado quando a conversa e desconhecida', async () => {
    await handler.handle(makeReply({ recipients: ['conv+naoexiste123@example.com'] }));

    expect(provider.sentMessages()).toHaveLength(0);
    expect(listInboundEmails(10)[0]?.status).toBe('unrouted');
  });

  it('nao processa o proprio e-mail de notificacao (protecao contra laco)', async () => {
    await handler.handle(makeReply({ from: 'WhatsRouter <bot@example.com>' }));
    expect(provider.sentMessages()).toHaveLength(0);
    expect(listInboundEmails(10)).toHaveLength(0);
  });

  it('ignora remetente fora da lista autorizada', async () => {
    applyTestSettings({ 'mail.allowlist': 'dono@example.com' });
    await handler.handle(makeReply({ from: 'estranho@exemplo.com' }));

    expect(provider.sentMessages()).toHaveLength(0);
    expect(listInboundEmails(10)[0]?.status).toBe('ignored');
  });

  it('e idempotente pelo Message-ID do e-mail', async () => {
    const reply = makeReply({ messageId: '<unico@exemplo.com>' });
    await handler.handle(reply);
    await handler.handle(reply);

    expect(provider.sentMessages()).toHaveLength(1);
  });

  it('ignora corpo vazio depois de remover o historico citado', async () => {
    await handler.handle(makeReply({ text: '> apenas historico citado' }));

    expect(provider.sentMessages()).toHaveLength(0);
    expect(listInboundEmails(10)[0]?.status).toBe('empty');
  });

  it('envia anexos do e-mail como midia no WhatsApp', async () => {
    await handler.handle(
      makeReply({
        text: 'segue a foto',
        attachments: [{ filename: 'foto.jpg', mimeType: 'image/jpeg', content: Buffer.from('imagem') }]
      })
    );

    const sent = provider.sentMessages();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.content.media?.fileName).toBe('foto.jpg');
  });
});