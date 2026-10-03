import { getDb, initDb } from '../src/db/client.js';
import { getConfig, setSettings, type AppConfig } from '../src/settings/service.js';
import {
  contacts,
  conversations,
  events,
  inboundEmails,
  messages,
  outbox,
  sessions,
  settings
} from '../src/db/schema.js';

/** Limpa todas as tabelas entre testes, mantendo o schema. */
export function resetDatabase(): void {
  const db = getDb();
  db.delete(settings).run();
  db.delete(messages).run();
  db.delete(outbox).run();
  db.delete(inboundEmails).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
  db.delete(events).run();
  db.delete(sessions).run();
}

export function prepareDatabase(): void {
  initDb();
  resetDatabase();
}

/** Configuracao base de e-mail para os testes (SMTP capturado por mock). */
export const TEST_MAIL_SETTINGS: Record<string, string> = {
  'mail.system_email': 'bot@example.com',
  'mail.system_name': 'WhatsRouter Teste',
  'mail.owner_email': 'dono@example.com',
  'mail.reply_domain': 'example.com',
  'mail.smtp_host': 'localhost',
  'mail.smtp_port': '2525',
  'mail.smtp_secure': 'false',
  'mail.smtp_user': '',
  'mail.smtp_password': '',
  'consolidation.dm_minutes': '0',
  'consolidation.group_minutes': '0',
  'auto_reply.cooldown_hours': '24',
  'pause.auto_minutes': '30'
};

export function applyTestSettings(extra: Record<string, string> = {}): AppConfig {
  setSettings({ ...TEST_MAIL_SETTINGS, ...extra });
  return getConfig();
}
