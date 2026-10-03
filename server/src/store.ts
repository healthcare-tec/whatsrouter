import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull, like, lte, or, sql } from 'drizzle-orm';
import { getDb } from './db/client.js';
import {
  contacts,
  conversations,
  events,
  inboundEmails,
  messages,
  outbox,
  type Contact,
  type Conversation,
  type Message
} from './db/schema.js';
import type { ChatKind, MessageKind, MessageSource } from './domain/types.js';

/* -------------------------------------------------------------------------- */
/* Contatos                                                                    */
/* -------------------------------------------------------------------------- */

export function upsertContact(input: {
  jid: string;
  phone?: string | null;
  name?: string | null;
  isGroup: boolean;
}): Contact {
  const db = getDb();
  const existing = db.select().from(contacts).where(eq(contacts.jid, input.jid)).get();
  if (existing) {
    const patch: Partial<Contact> = {};
    if (input.name && input.name !== existing.name) patch.name = input.name;
    if (input.phone && input.phone !== existing.phone) patch.phone = input.phone;
    if (Object.keys(patch).length > 0) {
      db.update(contacts).set(patch).where(eq(contacts.id, existing.id)).run();
      return { ...existing, ...patch };
    }
    return existing;
  }
  const created = db
    .insert(contacts)
    .values({
      jid: input.jid,
      phone: input.phone ?? null,
      name: input.name ?? null,
      isGroup: input.isGroup,
      blocked: false,
      createdAt: new Date()
    })
    .returning()
    .get();
  return created;
}

export function getContactByJid(jid: string): Contact | undefined {
  return getDb().select().from(contacts).where(eq(contacts.jid, jid)).get();
}

export function setContactBlocked(jid: string, blocked: boolean): void {
  getDb().update(contacts).set({ blocked }).where(eq(contacts.jid, jid)).run();
}

export function markContactNotified(contactId: number, when = new Date()): void {
  getDb().update(contacts).set({ lastNotifiedAt: when }).where(eq(contacts.id, contactId)).run();
}

/* -------------------------------------------------------------------------- */
/* Conversas                                                                   */
/* -------------------------------------------------------------------------- */

export function ensureConversation(input: {
  jid: string;
  kind: ChatKind;
  contactId: number;
  title?: string | null;
}): Conversation {
  const db = getDb();
  const existing = db.select().from(conversations).where(eq(conversations.jid, input.jid)).get();
  if (existing) {
    if (input.title && input.title !== existing.title) {
      db.update(conversations).set({ title: input.title }).where(eq(conversations.id, existing.id)).run();
      return { ...existing, title: input.title };
    }
    return existing;
  }
  return db
    .insert(conversations)
    .values({
      contactId: input.contactId,
      jid: input.jid,
      kind: input.kind,
      token: randomUUID().replace(/-/g, '').slice(0, 16),
      title: input.title ?? null,
      createdAt: new Date()
    })
    .returning()
    .get();
}

export function getConversationById(id: number): Conversation | undefined {
  return getDb().select().from(conversations).where(eq(conversations.id, id)).get();
}

export function getConversationByJid(jid: string): Conversation | undefined {
  return getDb().select().from(conversations).where(eq(conversations.jid, jid)).get();
}

export function getConversationByToken(token: string): Conversation | undefined {
  return getDb().select().from(conversations).where(eq(conversations.token, token)).get();
}

export function getConversationByEmailMessageId(messageId: string): Conversation | undefined {
  return getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.lastEmailMessageId, messageId))
    .get();
}

/** Procura a conversa a partir de qualquer Message-ID ja enviado por ela. */
export function findConversationIdByEmailMessageIds(messageIds: string[]): number | null {
  if (messageIds.length === 0) return null;
  const db = getDb();
  for (const messageId of messageIds) {
    const direct = getConversationByEmailMessageId(messageId);
    if (direct) return direct.id;
    const viaOutbox = db
      .select({ conversationId: outbox.conversationId })
      .from(outbox)
      .where(eq(outbox.emailMessageId, messageId))
      .get();
    if (viaOutbox?.conversationId) return viaOutbox.conversationId;
  }
  return null;
}

export function touchConversation(
  id: number,
  patch: {
    lastActivityAt?: Date;
    consolidateDueAt?: Date | null;
    title?: string | null;
  }
): void {
  getDb().update(conversations).set(patch).where(eq(conversations.id, id)).run();
}

export function setConversationPause(id: number, until: Date | null, reason?: string | null): void {
  getDb()
    .update(conversations)
    .set({ pausedUntil: until, pauseReason: until ? (reason ?? null) : null })
    .where(eq(conversations.id, id))
    .run();
}

export function setConversationEmailMessageId(id: number, messageId: string): void {
  getDb()
    .update(conversations)
    .set({ lastEmailMessageId: messageId, lastFlushAt: new Date() })
    .where(eq(conversations.id, id))
    .run();
}

export function incrementNotifications(id: number): void {
  getDb()
    .update(conversations)
    .set({ notificationsSent: sql`${conversations.notificationsSent} + 1` })
    .where(eq(conversations.id, id))
    .run();
}

/** Conversas cuja janela de consolidacao venceu e que nao estao pausadas. */
export function listConversationsDue(now = new Date(), limit = 25): Conversation[] {
  return getDb()
    .select()
    .from(conversations)
    .where(
      and(
        lte(conversations.consolidateDueAt, now),
        or(isNull(conversations.pausedUntil), lte(conversations.pausedUntil, now))
      )
    )
    .orderBy(asc(conversations.consolidateDueAt))
    .limit(limit)
    .all();
}

/** Conversas pausadas cuja pausa terminou (para retomada automatica). */
export function listConversationsPauseExpired(now = new Date(), limit = 25): Conversation[] {
  return getDb()
    .select()
    .from(conversations)
    .where(and(lte(conversations.pausedUntil, now), sql`${conversations.consolidateDueAt} is not null`))
    .orderBy(asc(conversations.pausedUntil))
    .limit(limit)
    .all();
}

export interface ConversationListItem extends Conversation {
  contactName: string | null;
  contactPhone: string | null;
  contactBlocked: boolean;
  isGroup: boolean;
  pendingCount: number;
}

export function listConversations(options: { limit?: number; search?: string } = {}): ConversationListItem[] {
  const db = getDb();
  const rows = db
    .select({
      conversation: conversations,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      contactBlocked: contacts.blocked,
      isGroup: contacts.isGroup,
      pendingCount: sql<number>`(
        select count(*) from ${messages}
        where ${messages.conversationId} = ${conversations.id}
          and ${messages.outboxId} is null
          and ${messages.direction} = 'in'
      )`
    })
    .from(conversations)
    .leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .orderBy(desc(conversations.lastActivityAt))
    .limit(options.limit ?? 200)
    .all();

  const search = options.search?.trim().toLowerCase();
  return rows
    .map((row) => ({
      ...row.conversation,
      contactName: row.contactName ?? null,
      contactPhone: row.contactPhone ?? null,
      contactBlocked: Boolean(row.contactBlocked),
      isGroup: Boolean(row.isGroup),
      pendingCount: Number(row.pendingCount ?? 0)
    }))
    .filter((row) => {
      if (!search) return true;
      return (
        (row.title ?? '').toLowerCase().includes(search) ||
        (row.contactName ?? '').toLowerCase().includes(search) ||
        (row.contactPhone ?? '').includes(search) ||
        row.jid.toLowerCase().includes(search)
      );
    });
}

/* -------------------------------------------------------------------------- */
/* Mensagens                                                                   */
/* -------------------------------------------------------------------------- */

export function messageExists(waMessageId: string): boolean {
  const row = getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.waMessageId, waMessageId))
    .get();
  return Boolean(row);
}

export function insertMessage(input: {
  conversationId: number;
  waMessageId?: string | null;
  direction: 'in' | 'out';
  source: MessageSource;
  kind: MessageKind;
  senderJid?: string | null;
  senderName?: string | null;
  text?: string | null;
  transcript?: string | null;
  mediaPath?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  messageTimestamp?: Date | null;
}): Message {
  return getDb()
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      waMessageId: input.waMessageId ?? null,
      direction: input.direction,
      source: input.source,
      kind: input.kind,
      senderJid: input.senderJid ?? null,
      senderName: input.senderName ?? null,
      text: input.text ?? null,
      transcript: input.transcript ?? null,
      mediaPath: input.mediaPath ?? null,
      mediaMime: input.mediaMime ?? null,
      mediaName: input.mediaName ?? null,
      mediaSize: input.mediaSize ?? null,
      messageTimestamp: input.messageTimestamp ?? new Date(),
      createdAt: new Date()
    })
    .returning()
    .get();
}

export function updateMessage(id: number, patch: Partial<Message>): void {
  getDb().update(messages).set(patch).where(eq(messages.id, id)).run();
}

/** Mensagens que ainda nao foram enviadas em nenhum e-mail. */
export function listPendingMessages(conversationId: number): Message[] {
  return getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.outboxId),
        eq(messages.direction, 'in')
      )
    )
    .orderBy(asc(messages.messageTimestamp), asc(messages.id))
    .all();
}

export function countPendingMessages(conversationId: number): number {
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.outboxId),
        eq(messages.direction, 'in')
      )
    )
    .get();
  return Number(row?.count ?? 0);
}

/** Ultimas mensagens da conversa, usadas como contexto no e-mail. */
export function listRecentMessages(conversationId: number, limit: number): Message[] {
  const rows = getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.messageTimestamp), desc(messages.id))
    .limit(limit)
    .all();
  return rows.reverse();
}

export function listMessages(conversationId: number, limit = 200): Message[] {
  return getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.messageTimestamp), desc(messages.id))
    .limit(limit)
    .all();
}

export function linkMessagesToOutbox(messageIds: number[], outboxId: number): void {
  if (messageIds.length === 0) return;
  const db = getDb();
  for (const id of messageIds) {
    db.update(messages).set({ outboxId }).where(eq(messages.id, id)).run();
  }
}

/* -------------------------------------------------------------------------- */
/* Caixa de saida (e-mails de notificacao)                                     */
/* -------------------------------------------------------------------------- */

export function createOutbox(input: {
  conversationId: number;
  subject: string;
  bodyText: string;
  messageCount: number;
  fromPause: boolean;
}): number {
  const row = getDb()
    .insert(outbox)
    .values({
      conversationId: input.conversationId,
      status: 'pending',
      subject: input.subject,
      bodyText: input.bodyText,
      messageCount: input.messageCount,
      fromPause: input.fromPause,
      createdAt: new Date()
    })
    .returning()
    .get();
  return row.id;
}

export function markOutboxSent(id: number, emailMessageId: string): void {
  getDb()
    .update(outbox)
    .set({ status: 'sent', emailMessageId, sentAt: new Date(), error: null })
    .where(eq(outbox.id, id))
    .run();
}

export function markOutboxFailed(id: number, error: string): void {
  const current = getDb().select().from(outbox).where(eq(outbox.id, id)).get();
  getDb()
    .update(outbox)
    .set({ status: 'failed', error, attempts: (current?.attempts ?? 0) + 1, sentAt: new Date() })
    .where(eq(outbox.id, id))
    .run();
}

export function listOutbox(limit = 50) {
  return getDb().select().from(outbox).orderBy(desc(outbox.createdAt)).limit(limit).all();
}

/* -------------------------------------------------------------------------- */
/* E-mails recebidos                                                           */
/* -------------------------------------------------------------------------- */

export function inboundEmailExists(messageId: string): boolean {
  const row = getDb()
    .select({ id: inboundEmails.id })
    .from(inboundEmails)
    .where(eq(inboundEmails.emailMessageId, messageId))
    .get();
  return Boolean(row);
}

export function insertInboundEmail(input: {
  emailMessageId: string | null;
  conversationId?: number | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  status: string;
  error?: string | null;
}): number {
  const row = getDb()
    .insert(inboundEmails)
    .values({
      emailMessageId: input.emailMessageId,
      conversationId: input.conversationId ?? null,
      fromAddress: input.fromAddress ?? null,
      toAddress: input.toAddress ?? null,
      subject: input.subject ?? null,
      bodyText: input.bodyText ?? null,
      status: input.status,
      error: input.error ?? null,
      createdAt: new Date(),
      processedAt: new Date()
    })
    .returning()
    .get();
  return row.id;
}

export function listInboundEmails(limit = 50) {
  return getDb().select().from(inboundEmails).orderBy(desc(inboundEmails.createdAt)).limit(limit).all();
}

/* -------------------------------------------------------------------------- */
/* Eventos                                                                     */
/* -------------------------------------------------------------------------- */

export function logEvent(
  level: 'debug' | 'info' | 'warn' | 'error',
  type: string,
  message: string,
  meta?: unknown
): void {
  try {
    getDb()
      .insert(events)
      .values({
        level,
        type,
        message,
        meta: meta === undefined ? null : JSON.stringify(meta),
        createdAt: new Date()
      })
      .run();
  } catch {
    // Nunca deixar o log de auditoria derrubar o fluxo principal.
  }
}

export function listEvents(options: { limit?: number; level?: string; search?: string } = {}) {
  const db = getDb();
  const conditions = [];
  if (options.level && options.level !== 'all') conditions.push(eq(events.level, options.level));
  if (options.search) conditions.push(like(events.message, `%${options.search}%`));
  const query = db.select().from(events).orderBy(desc(events.id)).limit(options.limit ?? 200);
  return conditions.length > 0 ? query.where(and(...conditions)).all() : query.all();
}

export function pruneEvents(keep = 5000): void {
  const db = getDb();
  const row = db.select({ count: sql<number>`count(*)` }).from(events).get();
  if (Number(row?.count ?? 0) <= keep) return;
  db.run(
    sql`delete from ${events} where ${events.id} not in (select id from ${events} order by id desc limit ${keep})`
  );
}

/* -------------------------------------------------------------------------- */
/* Estatisticas                                                                */
/* -------------------------------------------------------------------------- */

export function dashboardStats() {
  const db = getDb();
  const pendingMessages = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(and(isNull(messages.outboxId), eq(messages.direction, 'in')))
    .get();
  const totalConversations = db.select({ count: sql<number>`count(*)` }).from(conversations).get();
  const lastSent = db
    .select()
    .from(outbox)
    .where(eq(outbox.status, 'sent'))
    .orderBy(desc(outbox.sentAt))
    .limit(1)
    .get();
  const failed = db
    .select({ count: sql<number>`count(*)` })
    .from(outbox)
    .where(eq(outbox.status, 'failed'))
    .get();
  const lastMessage = db
    .select()
    .from(messages)
    .orderBy(desc(messages.id))
    .limit(1)
    .get();

  return {
    pendingMessages: Number(pendingMessages?.count ?? 0),
    totalConversations: Number(totalConversations?.count ?? 0),
    lastEmailSentAt: lastSent?.sentAt ?? null,
    failedEmails: Number(failed?.count ?? 0),
    lastMessageAt: lastMessage?.messageTimestamp ?? null
  };
}
