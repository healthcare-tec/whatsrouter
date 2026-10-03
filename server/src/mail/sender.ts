import nodemailer, { type Transporter } from 'nodemailer';
import { log } from '../logger.js';
import type { AppConfig } from '../settings/service.js';
import type { ComposedMessage } from './composer.js';

export interface SendOptions {
  config: AppConfig;
  composed: ComposedMessage;
  to: string;
  replyTo: string;
  messageId: string;
  references?: string[];
  inReplyTo?: string;
  conversationToken: string;
  contactJid: string;
}

export function buildTransport(config: AppConfig): Transporter {
  if (!config.mail.smtpHost) {
    throw new Error('Servidor SMTP nao configurado (Configuracoes > E-mail do sistema)');
  }

  return nodemailer.createTransport({
    host: config.mail.smtpHost,
    port: config.mail.smtpPort,
    secure: config.mail.smtpSecure,
    auth: config.mail.smtpUser
      ? { user: config.mail.smtpUser, pass: config.mail.smtpPassword }
      : undefined
  });
}

/** Envia o e-mail de notificacao e devolve o Message-ID usado. */
export async function sendNotification(options: SendOptions): Promise<string> {
  const { config, composed } = options;
  const transport = buildTransport(config);

  try {
    const info = await transport.sendMail({
      from: config.mail.systemEmail
        ? { name: config.mail.systemName || 'WhatsRouter', address: config.mail.systemEmail }
        : undefined,
      to: options.to,
      replyTo: options.replyTo,
      subject: composed.subject,
      text: composed.text,
      html: composed.html,
      attachments: composed.attachments,
      messageId: options.messageId,
      references: options.references,
      inReplyTo: options.inReplyTo,
      headers: {
        'X-WhatsRouter-Conversation': options.conversationToken,
        'X-WhatsRouter-Contact': options.contactJid
      }
    });
    return info.messageId ?? options.messageId;
  } finally {
    transport.close();
  }
}

export async function sendTestEmail(config: AppConfig, to: string): Promise<void> {
  const transport = buildTransport(config);
  try {
    await transport.verify();
    await transport.sendMail({
      from: config.mail.systemEmail
        ? { name: config.mail.systemName || 'WhatsRouter', address: config.mail.systemEmail }
        : undefined,
      to,
      subject: '[WhatsRouter] Teste de envio',
      text:
        'Este e um e-mail de teste enviado pelo WhatsRouter.\n\n' +
        'Se voce recebeu esta mensagem, o envio por SMTP esta funcionando.'
    });
    log.info(`E-mail de teste enviado para ${to}`);
  } finally {
    transport.close();
  }
}

export async function verifySmtp(config: AppConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = buildTransport(config);
    try {
      await transport.verify();
      return { ok: true };
    } finally {
      transport.close();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}