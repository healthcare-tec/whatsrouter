import { randomUUID } from 'node:crypto';
import type { Conversation } from '../db/schema.js';

/** Prefixo do endereco de resposta: `conv+<token>@dominio`. */
export const REPLY_PREFIX = 'conv';

/**
 * Endereco de resposta exclusivo da conversa. Responder este e-mail e o
 * mecanismo padrao para o proprietario enviar uma mensagem no WhatsApp.
 */
export function replyAddress(conversation: Conversation, replyDomain: string, systemEmail = ''): string {
  const domain = (replyDomain || systemEmail.split('@')[1] || '').trim();
  if (!domain) return systemEmail;
  return `${REPLY_PREFIX}+${conversation.token}@${domain}`;
}

/** Extrai o token da conversa a partir de uma lista de destinatarios. */
export function extractTokenFromRecipients(recipients: string[]): string | null {
  for (const raw of recipients) {
    const address = raw.trim().replace(/^.*<|>$/g, '').toLowerCase();
    const [local] = address.split('@');
    if (!local) continue;
    const parts = local.split('+');
    if (parts.length >= 2) {
      const token = parts[parts.length - 1]!.replace(/[^a-z0-9]/g, '');
      if (token.length >= 6) return token;
    }
  }
  return null;
}

export function buildMessageId(conversationToken: string, replyDomain: string): string {
  const domain = replyDomain || 'whatsrouter.local';
  return `<c${conversationToken}.${Date.now()}.${randomUUID().slice(0, 8)}@${domain}>`;
}

export function normalizeMessageId(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`;
}

/** Extrai todos os Message-IDs citados em References/In-Reply-To. */
export function parseMessageIds(value: string | string[] | undefined | null): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const entry of list) {
    const matches = entry.match(/<[^>]+>/g);
    if (matches) ids.push(...matches.map((id) => id.trim()));
    else if (entry.trim()) ids.push(normalizeMessageId(entry)!);
  }
  return ids.filter(Boolean);
}

/** Monta o assunto a partir do template configurado no painel. */
export function buildSubject(
  template: string,
  data: { contact: string; phone: string; count: number; kind: 'dm' | 'group'; date: Date }
): string {
  const replacements: Record<string, string> = {
    '{contact}': data.contact,
    '{phone}': data.phone,
    '{count}': String(data.count),
    '{kind}': data.kind === 'group' ? 'Grupo' : 'Conversa',
    '{date}': data.date.toLocaleString('pt-BR')
  };
  let subject = template || '[WhatsRouter] WhatsApp - {contact} ({phone})';
  for (const [key, value] of Object.entries(replacements)) {
    subject = subject.split(key).join(value);
  }
  return subject;
}