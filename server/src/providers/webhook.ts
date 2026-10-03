import { log } from '../logger.js';
import { isGroupJid } from '../utils/format.js';
import type {
  InboundMessage,
  MessageKind,
  OutboundContent,
  ProviderStatus,
  SendResult
} from '../domain/types.js';
import { BaseProvider } from './types.js';

export interface WebhookProviderOptions {
  /** URL que recebera as mensagens que o sistema precisa enviar. */
  outboundUrl?: string;
  /** Token enviado no cabecalho `x-whatsrouter-token`. */
  outboundToken?: string;
}

/**
 * Provedor generico: recebe mensagens por HTTP (`handleInbound`) e envia para
 * uma URL externa. E o encaixe para um fluxo do n8n (ou para a Cloud API
 * oficial da Meta) sem mudar o restante do sistema.
 *
 * Contrato esperado no webhook de entrada (todos os campos sao opcionais,
 * exceto `chatJid`):
 * {
 *   "waMessageId": "ABC123",
 *   "chatJid": "5511999999999@s.whatsapp.net",
 *   "senderJid": "5511999999999@s.whatsapp.net",
 *   "senderName": "Fulano",
 *   "kind": "dm" | "group",
 *   "messageKind": "text" | "image" | "audio" | ...,
 *   "text": "ola",
 *   "fromMe": false,
 *   "timestamp": "2026-01-01T12:00:00.000Z",
 *   "media": { "base64": "...", "mimeType": "image/jpeg", "fileName": "foto.jpg" }
 * }
 */
export class WebhookProvider extends BaseProvider {
  readonly name = 'webhook';
  private state: ProviderStatus['state'] = 'disconnected';
  private lastError?: string;
  private since?: Date;
  private outboundUrl?: string;
  private outboundToken?: string;

  constructor(options: WebhookProviderOptions = {}) {
    super();
    this.outboundUrl = options.outboundUrl;
    this.outboundToken = options.outboundToken;
    this.state = options.outboundUrl ? 'connected' : 'disconnected';
  }

  configure(options: WebhookProviderOptions): void {
    this.outboundUrl = options.outboundUrl;
    this.outboundToken = options.outboundToken;
    this.state = options.outboundUrl ? 'connected' : 'disconnected';
    this.emitStatus(this.status());
  }

  status(): ProviderStatus {
    return {
      name: this.name,
      state: this.state,
      since: this.since,
      lastError: this.lastError,
      selfJid: this.outboundUrl ? 'webhook' : undefined
    };
  }

  async start(): Promise<void> {
    this.state = this.outboundUrl ? 'connected' : 'disconnected';
    if (this.state === 'connected') this.since = new Date();
    this.emitStatus(this.status());
  }

  async stop(): Promise<void> {
    this.state = 'disconnected';
    this.emitStatus(this.status());
  }

  /** Chamado pela rota POST /api/webhook/whatsapp. */
  handleInbound(payload: Record<string, unknown>): void {
    const chatJid = String(payload.chatJid ?? payload.jid ?? '');
    if (!chatJid) throw new Error('chatJid e obrigatorio');

    const media = payload.media as Record<string, string> | undefined;
    const message: InboundMessage = {
      waMessageId: String(payload.waMessageId ?? payload.id ?? `webhook-${Date.now()}`),
      chatJid,
      senderJid: String(payload.senderJid ?? chatJid),
      senderName: payload.senderName ? String(payload.senderName) : undefined,
      kind: (payload.kind as InboundMessage['kind']) ?? (isGroupJid(chatJid) ? 'group' : 'dm'),
      messageKind: (payload.messageKind as MessageKind) ?? 'text',
      text: payload.text ? String(payload.text) : undefined,
      media: media?.base64
        ? {
            mimeType: media.mimeType,
            fileName: media.fileName,
            data: Buffer.from(media.base64, 'base64')
          }
        : undefined,
      timestamp: payload.timestamp ? new Date(String(payload.timestamp)) : new Date(),
      fromMe: Boolean(payload.fromMe)
    };

    if (message.fromMe) this.emitOutbound(message);
    else this.emitMessage(message);
  }

  async send(to: string, content: OutboundContent): Promise<SendResult> {
    if (!this.outboundUrl) {
      throw new Error('URL de saida do webhook nao configurada');
    }

    const response = await fetch(this.outboundUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.outboundToken ? { 'x-whatsrouter-token': this.outboundToken } : {})
      },
      body: JSON.stringify({
        to,
        text: content.text ?? '',
        media: content.media
          ? {
              base64: content.media.data.toString('base64'),
              mimeType: content.media.mimeType,
              fileName: content.media.fileName
            }
          : undefined
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.lastError = `HTTP ${response.status}: ${detail.slice(0, 200)}`;
      throw new Error(this.lastError);
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    log.info(`Mensagem enviada via webhook para ${to}`);
    return { id: body.id ?? `webhook-${Date.now()}` };
  }
}