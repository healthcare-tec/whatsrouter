import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { log } from '../logger.js';
import type { AppConfig } from '../settings/service.js';

export interface ParsedReply {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string;
  recipients: string[];
  subject: string;
  text: string;
  attachments: { filename: string; mimeType: string; content: Buffer }[];
  date: Date;
  uid: number;
}

function addressList(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.flatMap((entry) => addressList(entry));
  }
  if (typeof input === 'object' && input !== null && 'text' in (input as Record<string, unknown>)) {
    return String((input as { text: string }).text)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Le a caixa do e-mail do sistema em busca das respostas do proprietario.
 * Usa IMAP com polling configuravel (a maioria dos provedores mantem a
 * conexao viva; o intervalo padrao e de 60s).
 */
export class MailReader {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private busy = false;
  private lastError?: string;
  private lastCheck?: Date;
  private connected = false;
  private processed = 0;

  constructor(
    private readonly getConfig: () => AppConfig,
    private readonly onReply: (reply: ParsedReply) => Promise<void>
  ) {}

  status() {
    return {
      running: this.running,
      connected: this.connected,
      lastCheck: this.lastCheck,
      lastError: this.lastError,
      processed: this.processed
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const config = this.getConfig();
    if (!config.mail.imapHost) {
      log.warn('IMAP nao configurado; a leitura de respostas por e-mail ficara desligada.');
      return;
    }
    await this.tick();
    const intervalMs = Math.max(15, config.mail.pollSeconds) * 1000;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    log.info(`Leitura de e-mail iniciada (a cada ${intervalMs / 1000}s)`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.connected = false;
  }

  /** Aplica configuracao nova sem reiniciar o processo. */
  async reload(): Promise<void> {
    const wasRunning = this.running;
    await this.stop();
    if (wasRunning) await this.start();
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const config = this.getConfig();
    try {
      await this.pollOnce(config);
      this.connected = true;
      this.lastError = undefined;
    } catch (error) {
      this.connected = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      log.warn(`Falha na leitura de e-mail: ${this.lastError}`);
    } finally {
      this.busy = false;
      this.lastCheck = new Date();
    }
  }

  private async pollOnce(config: AppConfig): Promise<void> {
    if (!config.mail.imapHost) return;

    const client = new ImapFlow({
      host: config.mail.imapHost,
      port: config.mail.imapPort,
      secure: config.mail.imapSecure,
      auth: { user: config.mail.imapUser, pass: config.mail.imapPassword },
      logger: false
    });

    await client.connect();
    const lock = await client.getMailboxLock(config.mail.imapFolder || 'INBOX');
    try {
      for await (const message of client.fetch({ seen: false }, { uid: true, source: true })) {
        if (!message.source) continue;
        try {
          const parsed = await this.toParsedReply(message.source, message.uid);
          await this.onReply(parsed);
          this.processed += 1;
          if (config.mail.markAsRead) {
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
          }
        } catch (error) {
          log.error('Erro ao processar resposta por e-mail', error);
        }
      }
    } finally {
      lock.release();
      await client.logout().catch(() => undefined);
    }
  }

  private async toParsedReply(source: Buffer, uid: number): Promise<ParsedReply> {
    const parsed = await simpleParser(source);
    const headers = parsed.headers as Map<string, unknown>;
    const headerValue = (name: string): string | null => {
      const value = headers.get(name);
      if (value === undefined || value === null) return null;
      return String(value);
    };

    const recipients = [
      ...addressList(parsed.to),
      ...addressList(parsed.cc),
      ...addressList(headerValue('delivered-to')),
      ...addressList(headerValue('x-original-to')),
      ...addressList(headerValue('envelope-to'))
    ];

    const references = String(headerValue('references') ?? '')
      .split(/\s+/)
      .filter((value) => value.startsWith('<'));

    return {
      messageId: parsed.messageId ?? headerValue('message-id'),
      inReplyTo: headerValue('in-reply-to'),
      references,
      from: parsed.from?.text ?? '',
      recipients: [...new Set(recipients)],
      subject: parsed.subject ?? '',
      text: parsed.text ?? '',
      attachments: (parsed.attachments ?? []).map((attachment) => ({
        filename: (attachment as { filename?: string }).filename ?? 'anexo',
        mimeType: (attachment as { contentType?: string }).contentType ?? 'application/octet-stream',
        content: (attachment as { content: Buffer }).content
      })),
      date: parsed.date ?? new Date(),
      uid
    };
  }
}

/** Testa a conexao IMAP com a configuracao atual. */
export async function verifyImap(config: AppConfig): Promise<{ ok: boolean; error?: string; messages?: number }> {
  if (!config.mail.imapHost) return { ok: false, error: 'Servidor IMAP nao configurado' };
  const client = new ImapFlow({
    host: config.mail.imapHost,
    port: config.mail.imapPort,
    secure: config.mail.imapSecure,
    auth: { user: config.mail.imapUser, pass: config.mail.imapPassword },
    logger: false
  });
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(config.mail.imapFolder || 'INBOX');
    return { ok: true, messages: mailbox.exists };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.logout().catch(() => undefined);
  }
}
