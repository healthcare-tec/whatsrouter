import fs from 'node:fs';
import path from 'node:path';
import type { Conversation, Message } from '../db/schema.js';
import type { AppConfig } from '../settings/service.js';
import { escapeHtml, formatBytes, formatDateTime, jidToPhone, summarize } from '../utils/format.js';
import { buildSubject } from './thread.js';

export interface ComposedMessage {
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
  skippedAttachments: string[];
}

export interface ComposeInput {
  conversation: Conversation;
  contactName: string;
  contactPhone: string;
  pending: Message[];
  context: Message[];
  config: AppConfig;
  fromPause: boolean;
  replyAddress: string;
}

function describeKind(kind: string): string {
  switch (kind) {
    case 'image':
      return '[imagem]';
    case 'audio':
      return '[audio]';
    case 'video':
      return '[video]';
    case 'document':
      return '[documento]';
    case 'sticker':
      return '[figurinha]';
    case 'location':
      return '[localizacao]';
    case 'contact':
      return '[contato]';
    default:
      return '';
  }
}

function messageBody(message: Message): string {
  const parts: string[] = [];
  const text = message.text?.trim();
  if (text) parts.push(text);

  if (message.transcript) {
    parts.push(`(transcricao do audio) ${message.transcript}`);
  }

  if (!text && !message.transcript) {
    const description = describeKind(message.kind);
    if (description) parts.push(description);
    else if (message.kind !== 'text') parts.push(`[${message.kind}]`);
  }

  return parts.join('\n');
}

/** Monta o e-mail de notificacao de uma conversa. */
export function composeNotification(input: ComposeInput): ComposedMessage {
  const { conversation, pending, context, config, fromPause, replyAddress } = input;
  const isGroup = conversation.kind === 'group';

  const subjectBase = buildSubject(config.mail.subjectTemplate, {
    contact: input.contactName,
    phone: input.contactPhone,
    count: pending.length,
    kind: conversation.kind as 'dm' | 'group',
    date: new Date()
  });

  const subject = fromPause ? `[pausa] ${subjectBase}` : subjectBase;

  const lines: string[] = [];
  lines.push(
    `WhatsApp ${isGroup ? 'grupo' : 'conversa'}: ${input.contactName} (${input.contactPhone || conversation.jid})`
  );
  lines.push(`${pending.length} mensagem(ns) nesta janela - ${formatDateTime(new Date())}`);

  if (fromPause) {
    lines.push('');
    lines.push('*** mensagens durante a pausa ***');
    lines.push('Voce assumiu esta conversa manualmente; as mensagens abaixo chegaram nesse periodo.');
  }

  const attachmentNames = new Map<number, string[]>();
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  const skipped: string[] = [];
  const maxBytes = Math.max(1, config.attachments.maxMb) * 1024 * 1024;

  const collect = (message: Message) => {
    if (!message.mediaPath) return;
    const names: string[] = [];
    try {
      if (!fs.existsSync(message.mediaPath)) return;
      const size = message.mediaSize ?? fs.statSync(message.mediaPath).size;
      if (size > maxBytes) {
        skipped.push(`${path.basename(message.mediaPath)} (${formatBytes(size)})`);
        names.push(`(anexo grande - ${formatBytes(size)}, nao enviado)`);
        attachmentNames.set(message.id, names);
        return;
      }
      const filename = mediaAttachmentName(message);
      attachments.push({
        filename,
        content: fs.readFileSync(message.mediaPath),
        contentType: message.mediaMime || 'application/octet-stream'
      });
      names.push(filename);
    } catch {
      skipped.push(path.basename(message.mediaPath));
    }
    attachmentNames.set(message.id, names);
  };

  lines.push('');
  lines.push('--- Mensagens novas -------------------------------------------------');
  for (const message of pending) {
    const when = formatDateTime(message.messageTimestamp ?? message.createdAt ?? new Date());
    const who = message.senderName || (isGroup ? jidToPhone(message.senderJid ?? '') : input.contactName);
    lines.push(`[${when}] ${who}:`);
    lines.push(messageBody(message));
    lines.push('');
    collect(message);
  }

  const contextMessages = context.filter((message) => !pending.some((item) => item.id === message.id));
  if (contextMessages.length > 0) {
    lines.push('--- Contexto (ultimas mensagens) ------------------------------------');
    for (const message of contextMessages) {
      const when = formatDateTime(message.messageTimestamp ?? message.createdAt ?? new Date());
      const who = message.senderName || (isGroup ? jidToPhone(message.senderJid ?? '') : input.contactName);
      const direction = message.direction === 'out' ? '(enviado)' : '';
      lines.push(`[${when}] ${who} ${direction}: ${summarize(messageBody(message), 400)}`);
    }
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push(`Anexos nao enviados por tamanho: ${skipped.join(', ')}`);
    lines.push('');
  }

  lines.push('--- Como responder --------------------------------------------------');
  lines.push(`Responda este e-mail normalmente: a mensagem sera enviada no WhatsApp.`);
  lines.push(`Endereco de resposta desta conversa: ${replyAddress}`);
  lines.push('Nao altere o destinatario para manter a conversa organizada.');
  if (attachmentNames.size > 0) {
    lines.push('Anexos enviados neste e-mail tambem aparecem no WhatsApp como midia.');
  }

  const text = lines.join('\n');

  // --- Versao HTML ---------------------------------------------------------
  const htmlParts: string[] = [];
  htmlParts.push('<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">');
  htmlParts.push(
    `<p><strong>WhatsApp ${isGroup ? 'grupo' : 'conversa'}:</strong> ${escapeHtml(input.contactName)} (${escapeHtml(
      input.contactPhone || conversation.jid
    )})<br/><span style="color:#555">${pending.length} mensagem(ns) - ${escapeHtml(
      formatDateTime(new Date())
    )}</span></p>`
  );
  if (fromPause) {
    htmlParts.push(
      '<p style="background:#fff7e6;border:1px solid #ffd591;padding:8px;border-radius:6px">' +
        '<strong>mensagens durante a pausa</strong><br/>Voce assumiu esta conversa manualmente; as mensagens abaixo chegaram nesse periodo.' +
        '</p>'
    );
  }

  for (const message of pending) {
    const when = formatDateTime(message.messageTimestamp ?? message.createdAt ?? new Date());
    const who = message.senderName || (isGroup ? jidToPhone(message.senderJid ?? '') : input.contactName);
    const body = escapeHtml(messageBody(message)).replace(/\n/g, '<br/>');
    const names = attachmentNames.get(message.id) ?? [];
    const attachmentNote =
      names.length > 0
        ? `<div style="color:#666;font-size:12px">anexo: ${escapeHtml(names.join(', '))}</div>`
        : '';
    htmlParts.push(
      '<div style="border-left:3px solid #25D366;padding-left:10px;margin:14px 0">' +
        `<div style="color:#666;font-size:12px">${escapeHtml(when)} - ${escapeHtml(who)}</div>` +
        `<div>${body}</div>${attachmentNote}</div>`
    );
  }

  if (contextMessages.length > 0) {
    htmlParts.push('<hr/><div style="color:#555;font-size:12px"><strong>Contexto</strong><br/>');
    for (const message of contextMessages) {
      const when = formatDateTime(message.messageTimestamp ?? message.createdAt ?? new Date());
      const who = message.senderName || (isGroup ? jidToPhone(message.senderJid ?? '') : input.contactName);
      const direction = message.direction === 'out' ? '(enviado) ' : '';
      htmlParts.push(
        `${escapeHtml(when)} - ${escapeHtml(who)} ${escapeHtml(direction)}${escapeHtml(
          summarize(messageBody(message), 400)
        )}<br/>`
      );
    }
    htmlParts.push('</div>');
  }

  if (skipped.length > 0) {
    htmlParts.push(
      `<p style="color:#a8071a;font-size:12px">Anexos nao enviados por tamanho: ${escapeHtml(
        skipped.join(', ')
      )}</p>`
    );
  }

  htmlParts.push(
    `<hr/><p style="color:#555;font-size:12px">Responda este e-mail normalmente: a mensagem sera enviada no WhatsApp.<br/>` +
      `Endereco de resposta desta conversa: <code>${escapeHtml(replyAddress)}</code></p>`
  );
  htmlParts.push('</div>');

  return { subject, text, html: htmlParts.join(''), attachments, skippedAttachments: skipped };
}

function mediaAttachmentName(message: Message): string {
  const base = `msg${message.id}`;
  if (message.mediaName) return `${base}-${message.mediaName}`;
  const ext = message.mediaPath ? path.extname(message.mediaPath) : '';
  return `${base}${ext || ''}`;
}