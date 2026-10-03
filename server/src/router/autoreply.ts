import type { Contact } from '../db/schema.js';
import type { AppConfig } from '../settings/service.js';

/**
 * Decide se o aviso de "modo automatico" deve ser enviado. Ele sai apenas uma
 * vez por contato dentro da janela configurada (padrao 24h) para nao virar spam.
 */
export function shouldSendAutoReply(
  contact: Pick<Contact, 'lastNotifiedAt' | 'blocked'>,
  config: AppConfig,
  now = new Date()
): boolean {
  if (!config.autoReply.enabled) return false;
  if (contact.blocked) return false;
  if (!config.autoReply.text.trim()) return false;
  if (!contact.lastNotifiedAt) return true;

  const cooldownMs = Math.max(0, config.autoReply.cooldownHours) * 60 * 60 * 1000;
  if (cooldownMs === 0) return true;
  return now.getTime() - new Date(contact.lastNotifiedAt).getTime() >= cooldownMs;
}

/** Texto final do aviso, com o nome do contato quando o template usar {nome}. */
export function renderAutoReply(text: string, contactName?: string | null): string {
  return text.split('{nome}').join(contactName?.trim() || 'ola').split('{name}').join(contactName?.trim() || 'hello');
}