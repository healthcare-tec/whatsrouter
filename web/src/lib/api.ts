export interface Conversation {
  id: number;
  jid: string;
  kind: 'dm' | 'group';
  token: string;
  title: string | null;
  lastActivityAt: string | null;
  consolidateDueAt: string | null;
  pausedUntil: string | null;
  pauseReason: string | null;
  notificationsSent: number;
  lastFlushAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactBlocked: boolean;
  isGroup: boolean;
  pendingCount: number;
}

export interface Message {
  id: number;
  conversationId: number;
  waMessageId: string | null;
  direction: 'in' | 'out';
  source: string;
  kind: string;
  senderJid: string | null;
  senderName: string | null;
  text: string | null;
  transcript: string | null;
  mediaName: string | null;
  mediaMime: string | null;
  mediaSize: number | null;
  messageTimestamp: string | null;
  outboxId: number | null;
}

export interface ProviderStatus {
  name: string;
  state: string;
  selfJid?: string;
  selfName?: string;
  qrDataUrl?: string;
  since?: string;
  lastError?: string;
}

export interface Stats {
  pendingMessages: number;
  totalConversations: number;
  lastEmailSentAt: string | null;
  failedEmails: number;
  lastMessageAt: string | null;
}

export interface StatusResponse {
  provider: ProviderStatus | null;
  mail: { running: boolean; connected: boolean; lastCheck: string | null; lastError?: string; processed: number };
  stats: Stats;
  media: { files: number; bytes: number };
  transcription: string;
  pause: { global: boolean; reason: string };
  runtime: { node: string; uptimeSeconds: number; memoryMb: number };
}

export interface EventRow {
  id: number;
  level: string;
  type: string;
  message: string;
  meta: string | null;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...init
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? `Erro ${response.status}`);
  }
  return data as T;
}

export const api = {
  me: () => request<{ user: { id: number; username: string } }>('/auth/me'),
  login: (username: string, password: string) =>
    request<{ user: { username: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  changePassword: (current: string, next: string) =>
    request<{ ok: boolean }>('/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }),

  status: () => request<StatusResponse>('/status'),
  settings: () =>
    request<{
      values: Record<string, string>;
      defaults: Record<string, string>;
      secrets: string[];
      mailPresets: Record<string, Record<string, string>>;
      mailPresetNames: string[];
      transcriptionDriver: string;
      envProvider: string;
    }>('/settings'),
  saveSettings: (values: Record<string, unknown>) =>
    request<{ ok: boolean; changed: string[] }>('/settings', { method: 'PUT', body: JSON.stringify({ values }) }),
  applyPreset: (name: string) =>
    request<{ ok: boolean }>('/settings/preset', { method: 'POST', body: JSON.stringify({ name }) }),
  testEmail: (to?: string) =>
    request<{ ok: boolean; to?: string; error?: string }>('/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ to })
    }),
  testImap: () => request<{ ok: boolean; error?: string; messages?: number }>('/settings/test-imap', { method: 'POST' }),
  testSmtp: () => request<{ ok: boolean; error?: string }>('/settings/test-smtp', { method: 'POST' }),

  restartProvider: () => request<{ ok: boolean }>('/provider/restart', { method: 'POST' }),
  logoutProvider: () => request<{ ok: boolean }>('/provider/logout', { method: 'POST' }),
  simulate: (payload: Record<string, unknown>) =>
    request<{ ok: boolean }>('/provider/simulate', { method: 'POST', body: JSON.stringify(payload) }),

  conversations: (search?: string) =>
    request<{ conversations: Conversation[] }>(`/conversations${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  conversation: (id: number) =>
    request<{ conversation: Conversation; pending: number; paused: boolean; messages: Message[] }>(`/conversations/${id}`),
  pauseConversation: (id: number, minutes?: number) =>
    request<{ ok: boolean; minutes: number }>(`/conversations/${id}/pause`, {
      method: 'POST',
      body: JSON.stringify({ minutes })
    }),
  resumeConversation: (id: number) => request<{ ok: boolean }>(`/conversations/${id}/resume`, { method: 'POST' }),
  flushConversation: (id: number) => request<{ ok: boolean; sent: boolean }>(`/conversations/${id}/flush`, { method: 'POST' }),
  sendToConversation: (id: number, text: string) =>
    request<{ ok: boolean; id: string }>(`/conversations/${id}/send`, { method: 'POST', body: JSON.stringify({ text }) }),
  blockConversation: (id: number, blocked: boolean) =>
    request<{ ok: boolean }>(`/conversations/${id}/block`, { method: 'POST', body: JSON.stringify({ blocked }) }),

  setGlobalPause: (paused: boolean, reason = '') =>
    request<{ ok: boolean }>('/pause/global', { method: 'POST', body: JSON.stringify({ paused, reason }) }),
  pauseAll: (minutes?: number) =>
    request<{ ok: boolean; conversations: number }>('/pause/all', { method: 'POST', body: JSON.stringify({ minutes }) }),
  resumeAll: () => request<{ ok: boolean; conversations: number }>('/pause/resume-all', { method: 'POST' }),

  events: (level?: string, search?: string) => {
    const params = new URLSearchParams();
    if (level && level !== 'all') params.set('level', level);
    if (search) params.set('search', search);
    const query = params.toString();
    return request<{ events: EventRow[] }>(`/events${query ? `?${query}` : ''}`);
  },
  outbox: () =>
    request<{
      outbox: {
        id: number;
        conversationId: number;
        status: string;
        subject: string;
        messageCount: number;
        fromPause: boolean;
        emailMessageId: string | null;
        error: string | null;
        sentAt: string | null;
        createdAt: string;
      }[];
    }>('/outbox'),
  inboundEmails: () =>
    request<{
      inboundEmails: {
        id: number;
        conversationId: number | null;
        fromAddress: string | null;
        subject: string | null;
        status: string;
        error: string | null;
        createdAt: string;
      }[];
    }>('/inbound-emails')
};

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return String(value);
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}