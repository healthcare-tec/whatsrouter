import type { ParsedReply } from '../mail/reader.js';
import type { WhatsAppProvider } from '../providers/types.js';
import { log } from '../logger.js';
import { getConfig } from '../settings/service.js';
import {
  findConversationIdByEmailMessageIds,
  getConversationById,
  getConversationByToken,
  inboundEmailExists,
  insertInboundEmail,
  insertMessage,
  logEvent,
  messageExists,
  touchConversation
} from '../store.js';
import { cleanReplyBody } from '../mail/replyCleaner.js';
import { extractTokenFromRecipients, normalizeMessageId, parseMessageIds } from '../mail/thread.js';

/** Converte a resposta do proprietario em mensagem no WhatsApp. */
export class ReplyHandler {
  constructor(private readonly getProvider: () => WhatsAppProvider | null) {}

  async handle(reply: ParsedReply): Promise<void> {
    const config = getConfig();
    const messageId = normalizeMessageId(reply.messageId);

    if (messageId && inboundEmailExists(messageId)) return;

    const from = (reply.from.match(/<([^>]+)>/)?.[1] ?? reply.from).trim().toLowerCase();
    const systemEmail = config.mail.systemEmail.trim().toLowerCase();

    // Nunca processar o proprio e-mail de notificacao (evita laco).
    if (from && systemEmail && from === systemEmail) {
      return;
    }

    if (config.mail.allowlist.length > 0 && !config.mail.allowlist.includes(from)) {
      insertInboundEmail({
        emailMessageId: messageId,
        fromAddress: from,
        toAddress: reply.recipients.join(', '),
        subject: reply.subject,
        status: 'ignored',
        error: 'remetente fora da lista autorizada'
      });
      logEvent('warn', 'email_ignored', `E-mail ignorado (remetente nao autorizado): ${from}`);
      return;
    }

    // --- Identificar a conversa -------------------------------------------
    const token = extractTokenFromRecipients(reply.recipients);
    let conversationId: number | null = null;
    if (token) {
      conversationId = getConversationByToken(token)?.id ?? null;
    }
    if (!conversationId) {
      const ids = [normalizeMessageId(reply.inReplyTo), ...parseMessageIds(reply.references)].filter(
        (value): value is string => Boolean(value)
      );
      conversationId = findConversationIdByEmailMessageIds(ids);
    }

    const body = cleanReplyBody(reply.text);
    const attachments = reply.attachments.filter((attachment) => attachment.content?.length > 0);

    if (!conversationId) {
      insertInboundEmail({
        emailMessageId: messageId,
        fromAddress: from,
        toAddress: reply.recipients.join(', '),
        subject: reply.subject,
        bodyText: body,
        status: 'unrouted',
        error: 'nao foi possivel identificar a conversa'
      });
      logEvent('warn', 'email_unrouted', `Resposta sem conversa identificada: ${reply.subject}`);
      return;
    }

    const conversation = getConversationById(conversationId)!;
    const provider = this.getProvider();

    if (!provider) {
      insertInboundEmail({
        emailMessageId: messageId,
        conversationId,
        fromAddress: from,
        toAddress: reply.recipients.join(', '),
        subject: reply.subject,
        bodyText: body,
        status: 'failed',
        error: 'provedor de WhatsApp indisponivel'
      });
      return;
    }

    if (!body && attachments.length === 0) {
      insertInboundEmail({
        emailMessageId: messageId,
        conversationId,
        fromAddress: from,
        toAddress: reply.recipients.join(', '),
        subject: reply.subject,
        bodyText: body,
        status: 'empty',
        error: 'sem conteudo apos remover o historico citado'
      });
      return;
    }

    try {
      if (body) {
        const result = await provider.send(conversation.jid, { text: body });
        insertMessage({
          conversationId: conversation.id,
          waMessageId: result.id || null,
          direction: 'out',
          source: 'email',
          kind: 'text',
          text: body,
          messageTimestamp: new Date()
        });
      }

      for (const attachment of attachments) {
        try {
          const result = await provider.send(conversation.jid, {
            media: {
              data: attachment.content,
              mimeType: attachment.mimeType,
              fileName: attachment.filename
            }
          });
          insertMessage({
            conversationId: conversation.id,
            waMessageId: result.id || null,
            direction: 'out',
            source: 'email',
            kind: attachment.mimeType.startsWith('image/')
              ? 'image'
              : attachment.mimeType.startsWith('audio/')
                ? 'audio'
                : attachment.mimeType.startsWith('video/')
                  ? 'video'
                  : 'document',
            mediaName: attachment.filename,
            messageTimestamp: new Date()
          });
        } catch (error) {
          log.warn(`Falha ao enviar anexo ${attachment.filename} no WhatsApp`, error);
        }
      }

      touchConversation(conversation.id, { lastActivityAt: new Date() });
      insertInboundEmail({
        emailMessageId: messageId,
        conversationId,
        fromAddress: from,
        toAddress: reply.recipients.join(', '),
        subject: reply.subject,
        bodyText: body,
        status: 'processed'
      });
      logEvent('info', 'email_reply', `Resposta enviada no WhatsApp para ${conversation.jid}`, {
        conversationId,
        attachments: attachments.length
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      insertInboundEmail({
        emailMessageId: messageId,
        conversationId,
        fromAddress: from,
        toAddress: reply.recipients.join(', '),
        subject: reply.subject,
        bodyText: body,
        status: 'failed',
        error: detail
      });
      logEvent('error', 'email_reply_failed', `Falha ao responder no WhatsApp: ${detail}`);
    }
  }
}
