import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sent: [] as Record<string, any>[] }));

vi.mock('../../mail/sender.js', () => ({
  sendNotification: vi.fn(async (options: Record<string, unknown>) => {
    mocks.sent.push(options);
    return '<enviado@example.com>';
  }),
  sendTestEmail: vi.fn(),
  verifySmtp: vi.fn(async () => ({ ok: true })),
  buildTransport: vi.fn()
}));

import { ConsolidationScheduler } from '../consolidation.js';
import { MessageIngest } from '../ingest.js';
import { MockProvider } from '../../providers/mock.js';
import { getConversationByJid, listMessages, listOutbox, countPendingMessages } from '../../store.js';
import { applyTestSettings, prepareDatabase } from '../../../test/helpers.js';
import { setGlobalPause, pauseConversation } from '../pause.js';

const CHAT = '5511999999999@s.whatsapp.net';

function makeMessage(text: string, overrides: Record<string, unknown> = {}) {
  return {
    waMessageId: `msg-${Math.random().toString(36).slice(2)}`,
    chatJid: CHAT,
    senderJid: CHAT,
    senderName: 'Maria',
    kind: 'dm' as const,
    messageKind: 'text' as const,
    text,
    timestamp: new Date(),
    fromMe: false,
    ...overrides
  };
}

describe('consolidacao e envio de e-mails', () => {
  let provider: MockProvider;
  let ingest: MessageIngest;
  let scheduler: ConsolidationScheduler;

  beforeEach(() => {
    prepareDatabase();
    applyTestSettings({ 'consolidation.dm_minutes': '0', 'consolidation.group_minutes': '0' });
    mocks.sent.length = 0;
    provider = new MockProvider();
    ingest = new MessageIngest(() => provider);
    scheduler = new ConsolidationScheduler(() => provider);
  });

  it('agrupa varias mensagens em um unico e-mail', async () => {
    await ingest.handleInbound(makeMessage('primeira') as never);
    await ingest.handleInbound(makeMessage('segunda') as never);
    await ingest.handleInbound(makeMessage('terceira') as never);

    const sentCount = await scheduler.flushDue();
    expect(sentCount).toBe(1);
    expect(mocks.sent).toHaveLength(1);

    const options = mocks.sent[0]!;
    expect(options.to).toBe('dono@example.com');
    expect(String(options.replyTo)).toMatch(/^conv\+[a-z0-9]+@example\.com$/);
    expect(options.composed.subject).toContain('Maria');
    expect(options.composed.text).toContain('primeira');
    expect(options.composed.text).toContain('terceira');

    const conversation = getConversationByJid(CHAT)!;
    expect(conversation.lastEmailMessageId).toBe('<enviado@example.com>');
    expect(conversation.notificationsSent).toBe(1);
    expect(countPendingMessages(conversation.id)).toBe(0);
    expect(listMessages(conversation.id).filter((message) => message.outboxId !== null)).toHaveLength(3);
    expect(listOutbox(10)[0]?.status).toBe('sent');
  });

  it('nao envia nada quando nao ha mensagens pendentes', async () => {
    expect(await scheduler.flushDue()).toBe(0);
    expect(mocks.sent).toHaveLength(0);
  });

  it('nao envia enquanto a conversa esta pausada e envia depois, marcando a pausa', async () => {
    await ingest.handleInbound(makeMessage('chegou durante a pausa') as never);
    const conversation = getConversationByJid(CHAT)!;
    pauseConversation(conversation.id, 30, 'manual');

    expect(await scheduler.flushDue()).toBe(0);
    expect(mocks.sent).toHaveLength(0);
    expect(countPendingMessages(conversation.id)).toBe(1);

    // Simula o fim da pausa.
    const { setConversationPause } = await import('../../store.js');
    setConversationPause(conversation.id, new Date(Date.now() - 1000), 'manual');

    expect(await scheduler.flushDue()).toBe(1);
    expect(mocks.sent[0]?.composed.subject.startsWith('[pausa]')).toBe(true);
    expect(mocks.sent[0]?.composed.text).toContain('mensagens durante a pausa');

    const updated = getConversationByJid(CHAT)!;
    expect(updated.pausedUntil).toBeNull();
  });

  it('nao envia nada com a pausa global ativa', async () => {
    await ingest.handleInbound(makeMessage('oi') as never);
    setGlobalPause(true, 'teste');

    expect(await scheduler.flushDue()).toBe(0);
    expect(mocks.sent).toHaveLength(0);

    setGlobalPause(false);
    expect(await scheduler.flushDue()).toBe(1);
  });

  it('mantem a cadeia de conversa usando References do e-mail anterior', async () => {
    await ingest.handleInbound(makeMessage('primeira rodada') as never);
    await scheduler.flushDue();

    await ingest.handleInbound(makeMessage('segunda rodada') as never);
    await scheduler.flushDue();

    expect(mocks.sent).toHaveLength(2);
    expect(mocks.sent[1]?.references).toEqual(['<enviado@example.com>']);
  });

  it('inclui transcricao de audio e anexa o arquivo', async () => {
    applyTestSettings({ 'transcription.enabled': 'false' });
    await ingest.handleInbound(
      makeMessage('', {
        messageKind: 'audio',
        media: { mimeType: 'audio/ogg', data: Buffer.from('conteudo-de-audio'), fileName: 'voz.ogg' }
      }) as never
    );

    await scheduler.flushDue();
    const options = mocks.sent[0]!;
    expect(options.composed.attachments.length).toBe(1);
    expect(options.composed.attachments[0].contentType).toBe('audio/ogg');
  });
});