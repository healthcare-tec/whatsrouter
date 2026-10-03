import { beforeEach, describe, expect, it } from 'vitest';
import { MessageIngest } from '../ingest.js';
import { MockProvider } from '../../providers/mock.js';
import { getContactByJid, getConversationByJid, listMessages, countPendingMessages } from '../../store.js';
import { applyTestSettings, prepareDatabase } from '../../../test/helpers.js';
import { setSetting } from '../../settings/service.js';

const CHAT = '5511999999999@s.whatsapp.net';

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    waMessageId: `msg-${Math.random().toString(36).slice(2)}`,
    chatJid: CHAT,
    senderJid: CHAT,
    senderName: 'Maria',
    kind: 'dm' as const,
    messageKind: 'text' as const,
    text: 'ola, tudo bem?',
    timestamp: new Date(),
    fromMe: false,
    ...overrides
  };
}

describe('pipeline de entrada', () => {
  let provider: MockProvider;
  let ingest: MessageIngest;

  beforeEach(() => {
    prepareDatabase();
    applyTestSettings({ 'auto_reply.enabled': 'true', 'auto_reply.cooldown_hours': '24' });
    provider = new MockProvider();
    ingest = new MessageIngest(() => provider);
  });

  it('persiste a mensagem, cria contato e conversa e agenda a consolidacao', async () => {
    await ingest.handleInbound(makeMessage() as never);

    const conversation = getConversationByJid(CHAT);
    expect(conversation).toBeDefined();
    expect(conversation?.consolidateDueAt).toBeInstanceOf(Date);
    expect(conversation?.token).toHaveLength(16);

    const contact = getContactByJid(CHAT);
    expect(contact?.name).toBe('Maria');

    const messages = listMessages(conversation!.id);
    const inbound = messages.filter((message) => message.direction === 'in');
    expect(inbound).toHaveLength(1);
    // O aviso de modo automatico tambem e registrado como mensagem de saida.
    expect(messages).toHaveLength(2);
    expect(countPendingMessages(conversation!.id)).toBe(1);
  });

  it('envia o aviso de modo automatico apenas uma vez na janela', async () => {
    await ingest.handleInbound(makeMessage() as never);
    await ingest.handleInbound(makeMessage() as never);

    const sent = provider.sentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(CHAT);
    expect(sent[0]?.content.text).toContain('modo automatico');

    const conversation = getConversationByJid(CHAT)!;
    const messages = listMessages(conversation.id);
    // 2 recebidas + 1 aviso enviado pelo sistema
    expect(messages.filter((message) => message.direction === 'out')).toHaveLength(1);
  });

  it('ignora mensagens duplicadas pelo identificador do WhatsApp', async () => {
    const message = makeMessage({ waMessageId: 'dup-1' });
    await ingest.handleInbound(message as never);
    await ingest.handleInbound(message as never);

    const conversation = getConversationByJid(CHAT)!;
    expect(countPendingMessages(conversation.id)).toBe(1);
  });

  it('ignora contatos na lista de bloqueio', async () => {
    setSetting('blocklist', '5511999999999');

    await ingest.handleInbound(makeMessage() as never);
    expect(getConversationByJid(CHAT)).toBeUndefined();
  });

  it('ignora grupos quando o encaminhamento de grupos esta desligado', async () => {
    setSetting('groups.enabled', 'false');
    await ingest.handleInbound(
      makeMessage({ chatJid: '123456@g.us', senderJid: CHAT, kind: 'group' }) as never
    );
    expect(getConversationByJid('123456@g.us')).toBeUndefined();
  });

  it('aceita grupos quando habilitado', async () => {
    setSetting('groups.enabled', 'true');
    await ingest.handleInbound(
      makeMessage({ chatJid: '123456@g.us', senderJid: CHAT, kind: 'group', senderName: 'Joao' }) as never
    );
    const conversation = getConversationByJid('123456@g.us');
    expect(conversation?.kind).toBe('group');
  });

  it('pausa a conversa por 30 minutos quando o proprietario responde direto', async () => {
    await ingest.handleInbound(makeMessage() as never);
    await ingest.handleOwnerMessage(makeMessage({ fromMe: true, text: 'respondi pelo celular' }) as never);

    const conversation = getConversationByJid(CHAT)!;
    expect(conversation.pausedUntil).toBeInstanceOf(Date);
    expect(conversation.pauseReason).toBe('manual');

    const remainingMinutes = (new Date(conversation.pausedUntil!).getTime() - Date.now()) / 60000;
    expect(remainingMinutes).toBeGreaterThan(28);
    expect(remainingMinutes).toBeLessThanOrEqual(30);
  });

  it('obedece aos comandos de pausa e retomada', async () => {
    await ingest.handleInbound(makeMessage() as never);

    await ingest.handleOwnerMessage(makeMessage({ fromMe: true, text: '!pausar 5' }) as never);
    let conversation = getConversationByJid(CHAT)!;
    const minutes = (new Date(conversation.pausedUntil!).getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(4);
    expect(minutes).toBeLessThanOrEqual(5);
    expect(provider.sentMessages().some((item) => item.content.text?.includes('Pausado por 5'))).toBe(true);

    await ingest.handleOwnerMessage(makeMessage({ fromMe: true, text: '!retomar' }) as never);
    conversation = getConversationByJid(CHAT)!;
    expect(conversation.pausedUntil).toBeNull();
  });

  it('responde o comando !status', async () => {
    await ingest.handleInbound(makeMessage() as never);
    await ingest.handleOwnerMessage(makeMessage({ fromMe: true, text: '!status' }) as never);

    const texts = provider.sentMessages().map((item) => item.content.text ?? '');
    expect(texts.some((text) => text.includes('WhatsRouter:'))).toBe(true);
    expect(texts.some((text) => text.includes('Mensagens na fila: 1'))).toBe(true);
  });

  it('salva a midia recebida e transcreve audio quando ha driver', async () => {
    applyTestSettings({
      'transcription.enabled': 'false',
      'attachments.max_mb': '5'
    });

    await ingest.handleInbound(
      makeMessage({
        messageKind: 'audio',
        text: undefined,
        media: { mimeType: 'audio/ogg', data: Buffer.from('fake-audio'), fileName: 'audio.ogg' }
      }) as never
    );

    const conversation = getConversationByJid(CHAT)!;
    const message = listMessages(conversation.id).find((item) => item.direction === 'in')!;
    expect(message.kind).toBe('audio');
    expect(message.mediaPath).not.toBeNull();
    expect(message.mediaPath ?? '').toMatch(/\.ogg$/);
    expect(message.mediaMime).toBe('audio/ogg');
    expect(message.mediaSize ?? 0).toBeGreaterThan(0);
  });
});
