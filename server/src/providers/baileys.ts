import fs from 'node:fs';
import path from 'node:path';
import baileys, {
  DisconnectReason,
  downloadMediaMessage,
  getContentType,
  useMultiFileAuthState,
  type WAMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { pino } from 'pino';
import QRCode from 'qrcode';
import { sessionDir } from '../env.js';
import { log } from '../logger.js';
import { isGroupJid, jidToPhone } from '../utils/format.js';
import type { InboundMessage, MessageKind, OutboundContent, ProviderStatus, SendResult } from '../domain/types.js';
import { BaseProvider } from './types.js';

// O pacote exporta a fabrica como default em algumas versoes e como named em
// outras; resolvemos os dois casos para nao quebrar em atualizacoes.
const makeWASocket: typeof baileys = ((baileys as unknown as { default?: typeof baileys }).default ??
  baileys) as typeof baileys;

/** Limite de seguranca para baixar midia automaticamente (bytes). */
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

export interface BaileysProviderOptions {
  /** Baixa midias automaticamente para anexar/transcrever. */
  downloadMedia?: boolean;
  /** Diretorio alternativo para a sessao (usado em testes). */
  sessionPath?: string;
}

export class BaileysProvider extends BaseProvider {
  readonly name = 'baileys';
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private starting = false;
  private state: ProviderStatus['state'] = 'disconnected';
  private qrDataUrl?: string;
  private qrText?: string;
  private selfJid?: string;
  private selfName?: string;
  private lastError?: string;
  private since?: Date;
  /** IDs enviados pelo proprio sistema, para nao confundir com assuncao manual. */
  private readonly selfSentIds = new Set<string>();
  private stopped = false;

  constructor(private readonly options: BaileysProviderOptions = {}) {
    super();
  }

  status(): ProviderStatus {
    return {
      name: this.name,
      state: this.state,
      selfJid: this.selfJid,
      selfName: this.selfName,
      qrDataUrl: this.qrDataUrl,
      qrText: this.qrText,
      since: this.since,
      lastError: this.lastError
    };
  }

  async start(): Promise<void> {
    if (this.starting || this.sock) return;
    this.starting = true;
    this.stopped = false;

    try {
      const authPath = this.options.sessionPath ?? sessionDir;
      fs.mkdirSync(authPath, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['WhatsRouter', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        retryRequestDelayMs: 10_000
      }) as ReturnType<typeof makeWASocket>;

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          this.qrText = qr;
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          } catch (error) {
            log.warn('Falha ao gerar QR Code', error);
          }
          this.state = 'connecting_qr';
          this.emitStatus(this.status());
        }

        if (connection === 'connecting') {
          this.state = 'connecting';
          this.emitStatus(this.status());
        }

        if (connection === 'open') {
          this.state = 'connected';
          this.qrDataUrl = undefined;
          this.qrText = undefined;
          this.since = new Date();
          this.selfJid = this.sock?.user?.id;
          this.selfName = this.sock?.user?.name ?? undefined;
          this.lastError = undefined;
          this.starting = false;
          log.info(`WhatsApp conectado como ${this.selfName ?? this.selfJid ?? 'desconhecido'}`);
          this.emitStatus(this.status());
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          this.sock = null;
          this.starting = false;
          this.selfJid = undefined;
          this.selfName = undefined;

          if (loggedOut) {
            this.state = 'disconnected';
            this.lastError = 'Sessao encerrada no celular. Leia o QR Code novamente.';
            this.emitStatus(this.status());
            log.warn('Sessao do WhatsApp encerrada (logout)');
          } else if (!this.stopped) {
            this.state = 'connecting';
            this.lastError = `Desconectado (${statusCode ?? 'sem codigo'}). Reconectando...`;
            this.emitStatus(this.status());
            setTimeout(() => {
              void this.start();
            }, 5000);
          } else {
            this.state = 'disconnected';
            this.emitStatus(this.status());
          }
        }
      });

      this.sock.ev.on('messages.upsert', async (payload: any) => {
        if (payload?.type !== 'notify' && payload?.type !== 'append') return;
        for (const raw of payload.messages ?? []) {
          try {
            await this.handleRawMessage(raw as WAMessage);
          } catch (error) {
            log.error('Erro ao normalizar mensagem do WhatsApp', error);
          }
        }
      });

      this.state = 'connecting';
      this.emitStatus(this.status());
    } catch (error) {
      this.starting = false;
      this.state = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      this.emitStatus(this.status());
      log.error('Falha ao iniciar Baileys', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    try {
      this.sock?.end(undefined);
    } catch {
      // ignora
    }
    this.sock = null;
    this.state = 'disconnected';
    this.qrDataUrl = undefined;
    this.qrText = undefined;
    this.emitStatus(this.status());
  }

  async logout(): Promise<void> {
    try {
      await this.sock?.logout();
    } catch {
      // ignora
    }
    this.sock = null;
    this.state = 'disconnected';
    this.selfJid = undefined;
    this.selfName = undefined;
    this.emitStatus(this.status());
  }

  async send(to: string, content: OutboundContent): Promise<SendResult> {
    if (!this.sock) throw new Error('WhatsApp nao esta conectado');

    let sent: WAMessage | undefined;
    if (content.media) {
      const mimeType = content.media.mimeType || 'application/octet-stream';
      const buffer = content.media.data;
      const isImage = mimeType.startsWith('image/');
      const isAudio = mimeType.startsWith('audio/');
      const isVideo = mimeType.startsWith('video/');

      const payload: Record<string, unknown> = content.text ? { caption: content.text } : {};
      if (isImage) sent = await this.sock.sendMessage(to, { image: buffer, ...payload });
      else if (isAudio) sent = await this.sock.sendMessage(to, { audio: buffer, mimetype: mimeType, ...payload });
      else if (isVideo) sent = await this.sock.sendMessage(to, { video: buffer, ...payload });
      else
        sent = await this.sock.sendMessage(to, {
          document: buffer,
          mimetype: mimeType,
          fileName: content.media.fileName,
          ...payload
        });

      if (content.text && isAudio) {
        await this.sock.sendMessage(to, { text: content.text });
      }
    } else {
      sent = await this.sock.sendMessage(to, { text: content.text ?? '' });
    }

    const id = sent?.key?.id ?? '';
    if (id) this.selfSentIds.add(id);
    return { id };
  }

  /** Converte uma mensagem crua do Baileys no formato interno. */
  private async handleRawMessage(raw: WAMessage): Promise<void> {
    const chatJid = raw.key?.remoteJid;
    if (!chatJid) return;
    const id = raw.key?.id ?? '';
    const fromMe = Boolean(raw.key?.fromMe);

    if (fromMe) {
      // Mensagem enviada pelo sistema: nao entra no fluxo de assuncao manual.
      if (this.selfSentIds.has(id)) {
        this.selfSentIds.delete(id);
        return;
      }
      this.emitOutbound({
        waMessageId: id,
        chatJid,
        senderJid: this.selfJid ?? chatJid,
        senderName: this.selfName,
        kind: isGroupJid(chatJid) ? 'group' : 'dm',
        messageKind: this.detectKind(raw),
        text: this.extractText(raw),
        timestamp: this.extractTimestamp(raw),
        fromMe: true
      });
      return;
    }

    const messageKind = this.detectKind(raw);
    const media = this.options.downloadMedia === false ? undefined : await this.downloadMedia(raw);

    this.emitMessage({
      waMessageId: id,
      chatJid,
      senderJid: raw.key?.participant ?? chatJid,
      senderName: raw.pushName ?? undefined,
      kind: isGroupJid(chatJid) ? 'group' : 'dm',
      messageKind,
      text: this.extractText(raw),
      media,
      timestamp: this.extractTimestamp(raw),
      fromMe: false
    });
  }

  private detectKind(raw: WAMessage): MessageKind {
    const type = getContentType(raw.message as any) ?? '';
    if (type.includes('image')) return 'image';
    if (type.includes('audio')) return 'audio';
    if (type.includes('video')) return 'video';
    if (type.includes('document')) return 'document';
    if (type.includes('sticker')) return 'sticker';
    if (type.includes('location')) return 'location';
    if (type.includes('contact')) return 'contact';
    if (type.includes('protocol') || type.includes('senderKeyDistribution')) return 'system';
    if (type.includes('conversation') || type.includes('extendedText')) return 'text';
    return type ? 'unknown' : 'unknown';
  }

  private extractText(raw: WAMessage): string | undefined {
    const message: any = raw.message ?? {};
    return (
      message.conversation ??
      message.extendedTextMessage?.text ??
      message.imageMessage?.caption ??
      message.videoMessage?.caption ??
      message.documentMessage?.caption ??
      message.buttonsResponseMessage?.selectedDisplayText ??
      message.listResponseMessage?.title ??
      message.templateButtonReplyMessage?.selectedDisplayText ??
      undefined
    );
  }

  private extractTimestamp(raw: WAMessage): Date {
    const seconds = Number(raw.messageTimestamp ?? 0);
    if (!seconds) return new Date();
    return new Date(seconds * 1000);
  }

  private async downloadMedia(raw: WAMessage): Promise<InboundMessage['media']> {
    const kind = this.detectKind(raw);
    if (!['image', 'audio', 'video', 'document'].includes(kind)) return undefined;

    const content: any = raw.message ?? {};
    const node =
      content.imageMessage ?? content.audioMessage ?? content.videoMessage ?? content.documentMessage ?? {};
    const declaredSize = Number(node?.fileLength ?? 0);
    if (declaredSize > MAX_DOWNLOAD_BYTES) {
      log.warn(`Midia grande demais (${declaredSize} bytes); nao sera baixada automaticamente.`);
      return {
        mimeType: node?.mimetype,
        fileName: node?.fileName,
        seconds: node?.seconds
      };
    }

    try {
      const buffer = (await downloadMediaMessage(
        raw,
        'buffer',
        {},
        { logger: pino({ level: 'silent' }), reuploadRequest: this.sock!.updateMediaMessage }
      )) as Buffer;
      return {
        mimeType: node?.mimetype,
        fileName: node?.fileName,
        seconds: node?.seconds,
        data: buffer
      };
    } catch (error) {
      log.warn('Falha ao baixar midia; seguindo apenas com metadados', {
        error: error instanceof Error ? error.message : String(error)
      });
      return { mimeType: node?.mimetype, fileName: node?.fileName, seconds: node?.seconds };
    }
  }
}

export function baileysSessionPath(): string {
  return path.resolve(sessionDir);
}

export function phoneFromJid(jid: string): string {
  return jidToPhone(jid);
}