import type { InboundMessage } from '../domain/types.js';
import type { WhatsAppProvider } from '../providers/types.js';
import { log } from '../logger.js';
import { getConfig } from '../settings/service.js';
import {
  ensureConversation,
  getContactByJid,
  getConversationByJid,
  insertMessage,
  logEvent,
  markContactNotified,
  messageExists,
  touchConversation,
  upsertContact
} from '../store.js';
import { saveMedia } from '../media/store.js';
import { transcribeAudio } from '../media/transcribe.js';
import { isStatusJid, jidToPhone, matchesBlocklist } from '../utils/format.js';
import { renderAutoReply, shouldSendAutoReply } from './autoreply.js';
import { HELP_TEXT, parseOwnerCommand } from './commands.js';
import { isConversationPaused, isGloballyPaused, pauseConversation, resumeAllConversations, resumeConversation } from './pause.js';
import { nextDueDate } from './windows.js';

/**
 * Pipeline de entrada: normaliza, deduplica, persiste, aplica as regras de
 * aviso automatico, detecta assuncao manual e agenda a consolidacao.
 */
export class MessageIngest {
  constructor(private readonly getProvider: () => WhatsAppProvider | null) {}

  /** Liga os eventos do provedor ao pipeline. */
  attach(provider: WhatsAppProvider): void {
    provider.on('message', (message) => {
      void this.handleInbound(message).catch((error) => log.error('Falha no pipeline de entrada', error));
    });
    provider.on('outbound', (message) => {
      void this.handleOwnerMessage(message).catch((error) =>
        log.error('Falha ao processar mensagem do proprietario', error)
      );
    });
  }

  /** Mensagem recebida de terceiros. */
  async handleInbound(message: InboundMessage): Promise<void> {
    const config = getConfig();
    if (isStatusJid(message.chatJid)) return;
    if (message.waMessageId && messageExists(message.waMessageId)) return;

    if (message.kind === 'group' && !config.groups.enabled) {
      logEvent('debug', 'group_ignored', `Grupo ignorado: ${message.chatJid}`);
      return;
    }

    const isGroup = message.kind === 'group';
    const phone = jidToPhone(isGroup ? message.senderJid : message.chatJid);

    if (
      matchesBlocklist(config.blocklist, [
        { jid: message.chatJid, phone: jidToPhone(message.chatJid) },
        { jid: message.senderJid, phone }
      ])
    ) {
      logEvent('info', 'blocked', `Mensagem de contato bloqueado: ${message.chatJid}`);
      return;
    }

    const contact = upsertContact({
      jid: message.chatJid,
      phone: jidToPhone(message.chatJid),
      name: isGroup ? null : message.senderName ?? null,
      isGroup
    });

    const conversation = ensureConversation({
      jid: message.chatJid,
      kind: message.kind,
      contactId: contact.id,
      title: isGroup ? null : message.senderName ?? null
    });

    // --- Midia ------------------------------------------------------------
    let mediaPath: string | null = null;
    let mediaSize: number | null = null;
    let mediaName: string | null = message.media?.fileName ?? null;
    let transcript: string | null = null;

    if (message.media?.data) {
      try {
        const stored = saveMedia({
          chatJid: message.chatJid,
          waMessageId: message.waMessageId,
          data: message.media.data,
          mimeType: message.media.mimeType,
          fileName: message.media.fileName
        });
        mediaPath = stored.filePath;
        mediaSize = stored.size;
        mediaName = stored.fileName;
      } catch (error) {
        log.warn('Falha ao salvar midia', error);
      }
    }

    if (message.messageKind === 'audio' && mediaPath) {
      transcript = await transcribeAudio(mediaPath, config);
    }

    // --- Persistencia -----------------------------------------------------
    insertMessage({
      conversationId: conversation.id,
      waMessageId: message.waMessageId,
      direction: 'in',
      source: 'unknown',
      kind: message.messageKind,
      senderJid: message.senderJid,
      senderName: message.senderName ?? null,
      text: message.text ?? null,
      transcript,
      mediaPath,
      mediaMime: message.media?.mimeType ?? null,
      mediaName,
      mediaSize,
      messageTimestamp: message.timestamp
    });

    // --- Aviso de modo automatico ----------------------------------------
    const freshContact = getContactByJid(message.chatJid) ?? contact;
    if (!isGroup || config.groups.enabled) {
      if (shouldSendAutoReply(freshContact, config)) {
        const provider = this.getProvider();
        if (provider) {
          const text = renderAutoReply(config.autoReply.text, message.senderName);
          try {
            await provider.send(message.chatJid, { text });
            markContactNotified(freshContact.id);
            insertMessage({
              conversationId: conversation.id,
              direction: 'out',
              source: 'system',
              kind: 'text',
              text,
              messageTimestamp: new Date()
            });
            logEvent('info', 'auto_reply', `Aviso de modo automatico enviado para ${message.chatJid}`);
          } catch (error) {
            log.warn('Falha ao enviar aviso de modo automatico', error);
          }
        }
      }
    }

    // --- Agendamento da consolidacao -------------------------------------
    const now = new Date();
    touchConversation(conversation.id, {
      lastActivityAt: now,
      consolidateDueAt: nextDueDate(now, message.kind, config)
    });

    const paused = isConversationPaused(conversation) || isGloballyPaused();
    if (paused) {
      logEvent('info', 'queued', `Mensagem acumulada durante pausa: ${message.chatJid}`, {
        conversationId: conversation.id
      });
    }
  }

  /**
   * Mensagem que saiu do proprio numero. Pode ser um comando do proprietario
   * ou uma resposta manual - que pausa a conversa por N minutos.
   */
  async handleOwnerMessage(message: InboundMessage): Promise<void> {
    const config = getConfig();
    const command = parseOwnerCommand(message.text);

    const conversation = getConversationByJid(message.chatJid);
    if (conversation) {
      insertMessage({
        conversationId: conversation.id,
        waMessageId: message.waMessageId || null,
        direction: 'out',
        source: 'manual',
        kind: message.messageKind,
        text: message.text ?? null,
        messageTimestamp: message.timestamp
      });
    }

    if (command && config.pause.commandsEnabled) {
      await this.executeCommand(command, message, conversation?.id ?? null);
      return;
    }

    if (!conversation) {
      logEvent('debug', 'manual_unknown', `Mensagem manual em conversa desconhecida: ${message.chatJid}`);
      return;
    }

    pauseConversation(conversation.id, config.pause.autoMinutes, 'manual');
    logEvent(
      'info',
      'takeover',
      `Voce respondeu diretamente ${message.chatJid}; e-mails pausados por ${config.pause.autoMinutes} min`,
      { conversationId: conversation.id }
    );
  }

  private async executeCommand(
    command: ReturnType<typeof parseOwnerCommand> & object,
    message: InboundMessage,
    conversationId: number | null
  ): Promise<void> {
    const provider = this.getProvider();
    const config = getConfig();

    const reply = async (text: string) => {
      if (!provider) return;
      try {
        await provider.send(message.chatJid, { text });
      } catch (error) {
        log.warn('Falha ao responder comando do proprietario', error);
      }
    };

    switch (command.type) {
      case 'pause': {
        const minutes = command.minutes ?? config.pause.autoMinutes;
        if (conversationId) {
          pauseConversation(conversationId, minutes, 'command');
          await reply(`Pausado por ${minutes} minuto(s) nesta conversa. Envie !retomar para voltar.`);
        } else {
          await reply('Nao ha conversa registrada aqui. Envie !pausar dentro da conversa desejada.');
        }
        break;
      }
      case 'resume': {
        if (conversationId) {
          resumeConversation(conversationId, 'command');
          await reply('Retomado. As mensagens acumuladas serao enviadas por e-mail em instantes.');
        } else {
          await reply('Nao ha conversa registrada aqui.');
        }
        break;
      }
      case 'resume_all': {
        const total = resumeAllConversations();
        await reply(`${total} conversa(s) retomada(s).`);
        break;
      }
      case 'status': {
        const { dashboardStats } = await import('../store.js');
        const stats = dashboardStats();
        await reply(
          [
            'WhatsRouter:',
            `Conversas: ${stats.totalConversations}`,
            `Mensagens na fila: ${stats.pendingMessages}`,
            `Ultimo e-mail: ${stats.lastEmailSentAt ? new Date(stats.lastEmailSentAt).toLocaleString('pt-BR') : 'nunca'}`,
            `Pausa global: ${isGloballyPaused() ? 'ativa' : 'inativa'}`
          ].join('\n')
        );
        break;
      }
      case 'help': {
        await reply(HELP_TEXT);
        break;
      }
      default:
        await reply(`Comando nao reconhecido. Envie !ajuda para ver a lista.`);
    }
  }
}