import type { WhatsAppProvider } from '../providers/types.js';
import type { Conversation } from '../db/schema.js';
import { log } from '../logger.js';
import { getConfig } from '../settings/service.js';
import {
  createOutbox,
  getContactByJid,
  getConversationById,
  incrementNotifications,
  linkMessagesToOutbox,
  listConversationsDue,
  listPendingMessages,
  listRecentMessages,
  logEvent,
  markOutboxFailed,
  markOutboxSent,
  setConversationEmailMessageId,
  setConversationPause,
  touchConversation
} from '../store.js';
import { composeNotification } from '../mail/composer.js';
import { sendNotification } from '../mail/sender.js';
import { buildMessageId, replyAddress } from '../mail/thread.js';
import { isGloballyPaused } from './pause.js';

/**
 * Consolida as mensagens recebidas e envia um e-mail por conversa quando a
 * janela (2 min para conversas, 30 min para grupos) termina.
 */
export class ConsolidationScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private busy = false;

  constructor(private readonly getProvider: () => WhatsAppProvider | null) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule();
    log.info('Agendador de consolidacao iniciado');
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  reload(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.running) this.schedule();
  }

  private schedule(): void {
    const seconds = Math.max(2, getConfig().consolidation.tickSeconds);
    this.timer = setTimeout(() => {
      void this.tick();
    }, seconds * 1000);
  }

  private async tick(): Promise<void> {
    try {
      await this.flushDue();
    } catch (error) {
      log.error('Falha no ciclo de consolidacao', error);
    } finally {
      if (this.running) this.schedule();
    }
  }

  /** Envia todas as conversas cuja janela venceu. */
  async flushDue(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let sent = 0;
    try {
      if (isGloballyPaused()) return 0;
      const now = new Date();
      const due = listConversationsDue(now);
      for (const conversation of due) {
        const pausedUntil = conversation.pausedUntil ? new Date(conversation.pausedUntil) : null;
        const fromPause = Boolean(pausedUntil && pausedUntil.getTime() <= now.getTime() && conversation.pauseReason);
        const ok = await this.flushConversation(conversation, { fromPause });
        if (ok) sent += 1;
      }
    } finally {
      this.busy = false;
    }
    return sent;
  }

  /** Forca o envio imediato de uma conversa (botao "enviar agora" no painel). */
  async flushConversationById(conversationId: number, fromPause = false): Promise<boolean> {
    const conversation = getConversationById(conversationId);
    if (!conversation) return false;
    return this.flushConversation(conversation, { fromPause });
  }

  private async flushConversation(conversation: Conversation, options: { fromPause: boolean }): Promise<boolean> {
    const config = getConfig();
    const pending = listPendingMessages(conversation.id);

    if (pending.length === 0) {
      touchConversation(conversation.id, { consolidateDueAt: null });
      if (conversation.pauseReason && !conversation.pausedUntil) setConversationPause(conversation.id, null, null);
      return false;
    }

    if (!config.mail.ownerEmail || !config.mail.systemEmail) {
      log.warn('E-mail do sistema ou do proprietario nao configurado; mensagens seguem na fila.');
      return false;
    }

    const contact = getContactByJid(conversation.jid);
    const context = listRecentMessages(conversation.id, config.consolidation.contextMessages);
    const replyTo = replyAddress(conversation, config.mail.replyDomain, config.mail.systemEmail);
    const messageId = buildMessageId(conversation.token, config.mail.replyDomain || config.mail.systemEmail.split('@')[1] || '');

    const composed = composeNotification({
      conversation,
      contactName: contact?.name || conversation.title || (contact?.phone ?? conversation.jid),
      contactPhone: contact?.phone ?? '',
      pending,
      context,
      config,
      fromPause: options.fromPause,
      replyAddress: replyTo
    });

    const outboxId = createOutbox({
      conversationId: conversation.id,
      subject: composed.subject,
      bodyText: composed.text,
      messageCount: pending.length,
      fromPause: options.fromPause
    });

    try {
      const previousId = conversation.lastEmailMessageId ?? undefined;
      const sentMessageId = await sendNotification({
        config,
        composed,
        to: config.mail.ownerEmail,
        replyTo,
        messageId,
        references: previousId ? [previousId] : undefined,
        inReplyTo: previousId,
        conversationToken: conversation.token,
        contactJid: conversation.jid
      });

      markOutboxSent(outboxId, sentMessageId);
      linkMessagesToOutbox(
        pending.map((message) => message.id),
        outboxId
      );
      setConversationEmailMessageId(conversation.id, sentMessageId);
      incrementNotifications(conversation.id);
      touchConversation(conversation.id, { consolidateDueAt: null });
      if (options.fromPause) setConversationPause(conversation.id, null, null);

      logEvent(
        'info',
        'email_sent',
        `E-mail enviado: ${composed.subject} (${pending.length} mensagem(ns))`,
        { conversationId: conversation.id, outboxId }
      );
      log.info(`Notificacao enviada para ${config.mail.ownerEmail} (${conversation.jid})`);
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      markOutboxFailed(outboxId, detail);
      // Reagenda com um pequeno atraso para tentar de novo sem inundar o log.
      touchConversation(conversation.id, { consolidateDueAt: new Date(Date.now() + 60_000) });
      logEvent('error', 'email_failed', `Falha ao enviar e-mail: ${detail}`, { conversationId: conversation.id });
      log.error('Falha ao enviar e-mail de notificacao', error);
      return false;
    }
  }
}