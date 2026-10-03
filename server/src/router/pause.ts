import {
  conversations,
  type Conversation
} from '../db/schema.js';
import { getDb } from '../db/client.js';
import { eq } from 'drizzle-orm';
import {
  setConversationPause,
  logEvent,
  listConversations,
  getConversationById
} from '../store.js';
import { getConfig, setSetting } from '../settings/service.js';

export type PauseReason = 'manual' | 'panel' | 'command' | 'global';

export function pauseConversation(id: number, minutes: number, reason: PauseReason = 'manual'): Date {
  const until = new Date(Date.now() + Math.max(1, minutes) * 60 * 1000);
  setConversationPause(id, until, reason);
  logEvent('info', 'pause', `Conversa ${id} pausada por ${minutes} minuto(s) (${reason})`, { id, until });
  return until;
}

export function resumeConversation(id: number, reason: PauseReason | 'expired' = 'command'): void {
  setConversationPause(id, null, null);
  logEvent('info', 'resume', `Conversa ${id} retomada (${reason})`, { id });
}

export function isConversationPaused(conversation: Conversation, now = new Date()): boolean {
  if (!conversation.pausedUntil) return false;
  return new Date(conversation.pausedUntil).getTime() > now.getTime();
}

export function isGloballyPaused(): boolean {
  return getConfig().pause.global;
}

export function setGlobalPause(paused: boolean, reason = ''): void {
  setSetting('pause.global', paused ? 'true' : 'false');
  setSetting('pause.global_reason', reason);
  logEvent('info', 'pause', paused ? `Pausa global ativada (${reason || 'sem motivo'})` : 'Pausa global desativada');
}

export function resumeAllConversations(): number {
  const paused = getDb()
    .select()
    .from(conversations)
    .all()
    .filter((conversation) => conversation.pausedUntil !== null);

  for (const conversation of paused) {
    resumeConversation(conversation.id, 'command');
  }
  return paused.length;
}

export function pauseAllConversations(minutes?: number): number {
  const config = getConfig();
  const list = listConversations({ limit: 1000 });
  const minutesToUse = minutes ?? config.pause.autoMinutes;
  for (const conversation of list) {
    pauseConversation(conversation.id, minutesToUse, 'panel');
  }
  return list.length;
}

export function pauseStateFor(id: number) {
  const conversation = getConversationById(id);
  if (!conversation) return null;
  return {
    id,
    pausedUntil: conversation.pausedUntil,
    reason: conversation.pauseReason,
    active: isConversationPaused(conversation),
    global: isGloballyPaused()
  };
}
