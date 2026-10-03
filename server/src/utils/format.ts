/** Utilitarios de formatacao e manipulacao de identificadores do WhatsApp. */

export const DM_SUFFIX = '@s.whatsapp.net';
export const GROUP_SUFFIX = '@g.us';

export function jidToPhone(jid: string): string {
  return jid.split('@')[0]?.split(':')[0] ?? jid;
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith(GROUP_SUFFIX);
}

export function isStatusJid(jid: string): boolean {
  return jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter');
}

export function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}${DM_SUFFIX}`;
}

/** Normaliza um telefone/JID informado no painel para comparacao. */
export function normalizeIdentifier(value: string): string {
  return value.replace(/\D/g, '');
}

export function matchesBlocklist(
  blocklist: string[],
  candidates: { jid: string; phone?: string | null }[]
): boolean {
  if (blocklist.length === 0) return false;
  const targets = new Set<string>();
  for (const entry of blocklist) {
    const digits = normalizeIdentifier(entry);
    if (digits) targets.add(digits);
    targets.add(entry.trim().toLowerCase());
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (targets.has(candidate.jid.toLowerCase())) return true;
    const digits = normalizeIdentifier(candidate.phone ?? candidate.jid);
    if (digits && targets.has(digits)) return true;
  }
  return false;
}

export function formatDateTime(date: Date, timeZone = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone
  }).format(date);
}

export function formatTime(date: Date, timeZone = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone
  }).format(date);
}

export function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Reduz o texto a um resumo curto, usado em assuntos e pre-visualizacoes. */
export function summarize(value: string | null | undefined, max = 60): string {
  if (!value) return '';
  const single = value.replace(/\s+/g, ' ').trim();
  return truncate(single, max);
}