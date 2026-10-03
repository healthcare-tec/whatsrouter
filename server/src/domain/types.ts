/** Tipos compartilhados do dominio do WhatsRouter. */

export type ChatKind = 'dm' | 'group';

export type MessageKind =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'system'
  | 'unknown';

export type MessageSource = 'system' | 'manual' | 'email' | 'unknown';

/** Mensagem normalizada que sai de qualquer provedor de WhatsApp. */
export interface InboundMessage {
  /** Identificador unico da mensagem no WhatsApp (chave de deduplicacao). */
  waMessageId: string;
  /** JID do chat: `5511999999999@s.whatsapp.net` (dm) ou `123@g.us` (grupo). */
  chatJid: string;
  /** JID de quem escreveu (em grupos, o participante). */
  senderJid: string;
  senderName?: string;
  kind: ChatKind;
  messageKind: MessageKind;
  text?: string;
  /** Legenda de uma midia (image/video/document). */
  caption?: string;
  media?: InboundMedia;
  timestamp: Date;
  /**
   * `true` quando a mensagem saiu do proprio celular do proprietario. Nesse caso
   * o sistema entende que ele assumiu a conversa e pausa o envio de e-mails.
   */
  fromMe: boolean;
}

export interface InboundMedia {
  mimeType?: string;
  fileName?: string;
  /** Bytes ja baixados, quando o provedor conseguiu baixar imediatamente. */
  data?: Buffer;
  /** Chave opaca usada pelo provedor para baixar a midia depois. */
  downloadKey?: string;
  seconds?: number;
}

/** Conteudo enviado pelo sistema (ou pelo proprietario via e-mail) para o WhatsApp. */
export interface OutboundContent {
  text?: string;
  media?: {
    data: Buffer;
    mimeType: string;
    fileName: string;
  };
}

export interface OutboundMessage {
  chatJid: string;
  content: OutboundContent;
  /** Origem do envio: `system` = aviso automatico, `email` = resposta por e-mail. */
  source: Exclude<MessageSource, 'manual' | 'unknown'>;
}

export interface ProviderStatus {
  name: string;
  state: 'disconnected' | 'connecting' | 'connecting_qr' | 'connected' | 'error';
  selfJid?: string;
  selfName?: string;
  /** QR Code em data URL (PNG) quando for necessario autenticar. */
  qrDataUrl?: string;
  qrText?: string;
  since?: Date;
  lastError?: string;
}

export interface SendResult {
  id: string;
}