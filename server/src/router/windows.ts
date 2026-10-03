import type { ChatKind } from '../domain/types.js';
import type { AppConfig } from '../settings/service.js';

/**
 * Janela de consolidacao: conversas individuais aguardam `dmMinutes` e grupos
 * aguardam `groupMinutes` desde a ultima mensagem recebida (debounce).
 */
export function consolidationWindowMs(kind: ChatKind, config: AppConfig): number {
  const minutes = kind === 'group' ? config.consolidation.groupMinutes : config.consolidation.dmMinutes;
  return Math.max(0, minutes) * 60 * 1000;
}

export function nextDueDate(from: Date, kind: ChatKind, config: AppConfig): Date {
  return new Date(from.getTime() + consolidationWindowMs(kind, config));
}

/** Descreve a janela em texto, para o painel e para os logs. */
export function describeWindow(kind: ChatKind, config: AppConfig): string {
  const minutes = kind === 'group' ? config.consolidation.groupMinutes : config.consolidation.dmMinutes;
  return `${minutes} min`;
}