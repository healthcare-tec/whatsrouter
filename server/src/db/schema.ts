import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** Configuracao chave/valor da instancia (editavel pelo painel). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
});

/** Usuarios do painel. */
export const authUsers = sqliteTable('auth_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
});

/** Sessoes do painel (cookie). */
export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' })
});

/** Contatos e grupos. */
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jid: text('jid').notNull().unique(),
  phone: text('phone'),
  name: text('name'),
  isGroup: integer('is_group', { mode: 'boolean' }).default(false).notNull(),
  blocked: integer('blocked', { mode: 'boolean' }).default(false).notNull(),
  /** Ultima vez que o aviso de modo automatico foi enviado (guarda anti-spam). */
  lastNotifiedAt: integer('last_notified_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
});

/** Uma conversa por contato/grupo; mantem o estado de consolidacao e de pausa. */
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: integer('contact_id').notNull(),
  jid: text('jid').notNull().unique(),
  kind: text('kind').notNull(),
  /** Token usado no Reply-To (`conv+<token>@dominio`) para rotear respostas. */
  token: text('token').notNull().unique(),
  title: text('title'),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp_ms' }),
  /** Deadline do debounce de consolidacao. `null` = nada pendente. */
  consolidateDueAt: integer('consolidate_due_at', { mode: 'timestamp_ms' }),
  pausedUntil: integer('paused_until', { mode: 'timestamp_ms' }),
  pauseReason: text('pause_reason'),
  /** Ultimo Message-ID enviado, usado em In-Reply-To/References. */
  lastEmailMessageId: text('last_email_message_id'),
  notificationsSent: integer('notifications_sent').default(0).notNull(),
  lastFlushAt: integer('last_flush_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
});

/** Todas as mensagens (entrada e saida). */
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull(),
  waMessageId: text('wa_message_id'),
  direction: text('direction').notNull(),
  source: text('source').notNull(),
  kind: text('kind').notNull(),
  senderJid: text('sender_jid'),
  senderName: text('sender_name'),
  text: text('text'),
  transcript: text('transcript'),
  mediaPath: text('media_path'),
  mediaMime: text('media_mime'),
  mediaName: text('media_name'),
  mediaSize: integer('media_size'),
  messageTimestamp: integer('message_timestamp', { mode: 'timestamp_ms' }),
  /** Preenchido quando a mensagem ja foi enviada em um e-mail de notificacao. */
  outboxId: integer('outbox_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
});

/** Cada e-mail de notificacao enviado ao proprietario. */
export const outbox = sqliteTable('outbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull(),
  status: text('status').notNull(),
  subject: text('subject').notNull(),
  bodyText: text('body_text'),
  messageCount: integer('message_count').default(0).notNull(),
  /** `true` quando o e-mail contem mensagens acumuladas durante uma pausa. */
  fromPause: integer('from_pause', { mode: 'boolean' }).default(false).notNull(),
  emailMessageId: text('email_message_id'),
  attempts: integer('attempts').default(0).notNull(),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  sentAt: integer('sent_at', { mode: 'timestamp_ms' })
});

/** Respostas recebidas por e-mail (idempotencia por Message-ID). */
export const inboundEmails = sqliteTable('inbound_emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  emailMessageId: text('email_message_id').unique(),
  conversationId: integer('conversation_id'),
  fromAddress: text('from_address'),
  toAddress: text('to_address'),
  subject: text('subject'),
  bodyText: text('body_text'),
  status: text('status').notNull(),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  processedAt: integer('processed_at', { mode: 'timestamp_ms' })
});

/** Trilha de auditoria exibida no painel. */
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level').notNull(),
  type: text('type').notNull(),
  message: text('message').notNull(),
  meta: text('meta'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
});

export type Contact = typeof contacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Outbox = typeof outbox.$inferSelect;
export type EventRow = typeof events.$inferSelect;