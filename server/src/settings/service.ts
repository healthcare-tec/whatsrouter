import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { settings } from '../db/schema.js';

/**
 * Configuracao da instancia. Tudo aqui e editavel pelo painel, exceto os
 * valores iniciais de infraestrutura (porta, banco), que vem de variaveis
 * de ambiente.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  // --- Rede e acesso -------------------------------------------------------
  'server.host': '', // vazio = usa HOST do ambiente (padrao 0.0.0.0)
  'server.port': '', // vazio = usa PORT do ambiente
  'server.public_url': '', // ex.: https://router.seudominio.com

  // --- Aviso de modo automatico -------------------------------------------
  'auto_reply.enabled': 'true',
  'auto_reply.text':
    'Ola! Esta conta esta em modo automatico. Sua mensagem sera encaminhada por e-mail ao responsavel e respondida assim que possivel. Se quiser, pode enviar mais detalhes por aqui.',
  'auto_reply.cooldown_hours': '24',

  // --- Consolidacao --------------------------------------------------------
  'consolidation.dm_minutes': '2',
  'consolidation.group_minutes': '30',
  'consolidation.context_messages': '10',
  'consolidation.tick_seconds': '10',

  // --- Anexos e transcricao ------------------------------------------------
  'attachments.max_mb': '20',
  'transcription.enabled': 'true',
  'transcription.provider': 'auto', // auto | service | openai | command | none
  'transcription.model': 'whisper-1',
  'transcription.api_key': '',
  'transcription.base_url': '',
  // Servico local compativel com OpenAI (faster-whisper-server, whisper.cpp server...)
  'transcription.service_url': '',
  'transcription.command': '', // ex.: whisper-cli -f {file} -otxt -of {out}

  // --- E-mail do sistema ---------------------------------------------------
  'mail.system_email': '',
  'mail.system_name': 'WhatsRouter',
  'mail.owner_email': '',
  'mail.subject_template': '[WhatsRouter] WhatsApp - {contact} ({phone})',
  'mail.reply_domain': '', // dominio usado em conv+<token>@dominio
  'mail.smtp_host': '',
  'mail.smtp_port': '587',
  'mail.smtp_secure': 'false',
  'mail.smtp_user': '',
  'mail.smtp_password': '',
  'mail.imap_host': '',
  'mail.imap_port': '993',
  'mail.imap_secure': 'true',
  'mail.imap_user': '',
  'mail.imap_password': '',
  'mail.imap_folder': 'INBOX',
  'mail.poll_seconds': '60',
  'mail.mark_as_read': 'true',
  'mail.allowlist': '', // um endereco autorizado por linha (vazio = qualquer um)

  // --- Pausa / assuncao manual --------------------------------------------
  'pause.auto_minutes': '30',
  'pause.global': 'false',
  'pause.global_reason': '',
  'pause.commands_enabled': 'true',

  // --- Grupos e bloqueios --------------------------------------------------
  'groups.enabled': 'true',
  'blocklist': '', // um jid/telefone por linha

  // --- Provedor ------------------------------------------------------------
  'provider.name': '',
  'provider.webhook_inbound_token': '',
  'provider.webhook_outbound_url': '',
  'provider.webhook_outbound_token': ''
};

/** Chaves que nunca devem ser devolvidas em texto claro pela API. */
export const SECRET_KEYS = new Set([
  'mail.smtp_password',
  'mail.imap_password',
  'transcription.api_key',
  'provider.webhook_inbound_token',
  'provider.webhook_outbound_token'
]);

export const MASK = '********';

export function allSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.select().from(settings).all();
  const result: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (row.value !== null && row.value !== undefined) result[row.key] = row.value;
  }
  return result;
}

export function getSetting(key: string): string {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (row?.value !== null && row?.value !== undefined) return row.value;
  return SETTING_DEFAULTS[key] ?? '';
}

export function getNumber(key: string, fallback = 0): number {
  const parsed = Number(getSetting(key));
  return Number.isFinite(parsed) && getSetting(key) !== '' ? parsed : fallback;
}

export function getBoolean(key: string, fallback = false): boolean {
  const raw = getSetting(key);
  if (raw === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(raw.toLowerCase());
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) {
    db.update(settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(settings.key, key))
      .run();
  } else {
    db.insert(settings).values({ key, value, updatedAt: new Date() }).run();
  }
}

/**
 * Grava um lote de configuracoes. Valores mascarados ou vazios em chaves
 * secretas sao ignorados para nao apagar credenciais salvas.
 */
export function setSettings(patch: Record<string, unknown>): string[] {
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!(key in SETTING_DEFAULTS)) continue;
    if (raw === undefined || raw === null) continue;
    const value = String(raw);
    if (SECRET_KEYS.has(key) && (value === '' || value === MASK)) continue;
    setSetting(key, value);
    changed.push(key);
  }
  return changed;
}

/** Versao segura para o painel: segredos aparecem mascarados. */
export function settingsForPanel(): Record<string, string> {
  const values = allSettings();
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = SECRET_KEYS.has(key) && value ? MASK : value;
  }
  return out;
}

export function listBlocked(): string[] {
  return getSetting('blocklist')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function listMailAllowlist(): string[] {
  return getSetting('mail.allowlist')
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/** Configuracao consolidada usada pelo restante do sistema. */
export interface AppConfig {
  autoReply: { enabled: boolean; text: string; cooldownHours: number };
  consolidation: { dmMinutes: number; groupMinutes: number; contextMessages: number; tickSeconds: number };
  attachments: { maxMb: number };
  transcription: {
    enabled: boolean;
    provider: string;
    model: string;
    apiKey: string;
    baseUrl: string;
    serviceUrl: string;
    command: string;
  };
  mail: {
    systemEmail: string;
    systemName: string;
    ownerEmail: string;
    subjectTemplate: string;
    replyDomain: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPassword: string;
    imapFolder: string;
    pollSeconds: number;
    markAsRead: boolean;
    allowlist: string[];
  };
  pause: { autoMinutes: number; global: boolean; globalReason: string; commandsEnabled: boolean };
  groups: { enabled: boolean };
  blocklist: string[];
  provider: {
    name: string;
    webhookInboundToken: string;
    webhookOutboundUrl: string;
    webhookOutboundToken: string;
  };
}

export function getConfig(): AppConfig {
  return {
    autoReply: {
      enabled: getBoolean('auto_reply.enabled', true),
      text: getSetting('auto_reply.text'),
      cooldownHours: getNumber('auto_reply.cooldown_hours', 24)
    },
    consolidation: {
      dmMinutes: getNumber('consolidation.dm_minutes', 2),
      groupMinutes: getNumber('consolidation.group_minutes', 30),
      contextMessages: getNumber('consolidation.context_messages', 10),
      tickSeconds: getNumber('consolidation.tick_seconds', 10)
    },
    attachments: { maxMb: getNumber('attachments.max_mb', 20) },
    transcription: {
      enabled: getBoolean('transcription.enabled', true),
      provider: getSetting('transcription.provider') || 'auto',
      model: getSetting('transcription.model') || 'whisper-1',
      apiKey: getSetting('transcription.api_key'),
      baseUrl: getSetting('transcription.base_url'),
      serviceUrl: getSetting('transcription.service_url'),
      command: getSetting('transcription.command')
    },
    mail: {
      systemEmail: getSetting('mail.system_email'),
      systemName: getSetting('mail.system_name') || 'WhatsRouter',
      ownerEmail: getSetting('mail.owner_email'),
      subjectTemplate: getSetting('mail.subject_template'),
      replyDomain: getSetting('mail.reply_domain'),
      smtpHost: getSetting('mail.smtp_host'),
      smtpPort: getNumber('mail.smtp_port', 587),
      smtpSecure: getBoolean('mail.smtp_secure', false),
      smtpUser: getSetting('mail.smtp_user'),
      smtpPassword: getSetting('mail.smtp_password'),
      imapHost: getSetting('mail.imap_host'),
      imapPort: getNumber('mail.imap_port', 993),
      imapSecure: getBoolean('mail.imap_secure', true),
      imapUser: getSetting('mail.imap_user'),
      imapPassword: getSetting('mail.imap_password'),
      imapFolder: getSetting('mail.imap_folder') || 'INBOX',
      pollSeconds: getNumber('mail.poll_seconds', 60),
      markAsRead: getBoolean('mail.mark_as_read', true),
      allowlist: listMailAllowlist()
    },
    pause: {
      autoMinutes: getNumber('pause.auto_minutes', 30),
      global: getBoolean('pause.global', false),
      globalReason: getSetting('pause.global_reason'),
      commandsEnabled: getBoolean('pause.commands_enabled', true)
    },
    groups: { enabled: getBoolean('groups.enabled', true) },
    blocklist: listBlocked(),
    provider: {
      name: getSetting('provider.name'),
      webhookInboundToken: getSetting('provider.webhook_inbound_token'),
      webhookOutboundUrl: getSetting('provider.webhook_outbound_url'),
      webhookOutboundToken: getSetting('provider.webhook_outbound_token')
    }
  };
}

/** Presets conhecidos de provedores de e-mail, usados no painel. */
export const MAIL_PRESETS: Record<string, Record<string, string>> = {
  'mail.com (mail.org)': {
    'mail.smtp_host': 'smtp.mail.com',
    'mail.smtp_port': '587',
    'mail.smtp_secure': 'false',
    'mail.imap_host': 'imap.mail.com',
    'mail.imap_port': '993',
    'mail.imap_secure': 'true'
  },
  'Gmail / Google Workspace': {
    'mail.smtp_host': 'smtp.gmail.com',
    'mail.smtp_port': '465',
    'mail.smtp_secure': 'true',
    'mail.imap_host': 'imap.gmail.com',
    'mail.imap_port': '993',
    'mail.imap_secure': 'true'
  },
  'Microsoft 365 / Outlook': {
    'mail.smtp_host': 'smtp.office365.com',
    'mail.smtp_port': '587',
    'mail.smtp_secure': 'false',
    'mail.imap_host': 'outlook.office365.com',
    'mail.imap_port': '993',
    'mail.imap_secure': 'true'
  },
  'Zoho Mail': {
    'mail.smtp_host': 'smtp.zoho.com',
    'mail.smtp_port': '465',
    'mail.smtp_secure': 'true',
    'mail.imap_host': 'imap.zoho.com',
    'mail.imap_port': '993',
    'mail.imap_secure': 'true'
  }
};

export function applyMailPreset(name: string): boolean {
  const preset = MAIL_PRESETS[name];
  if (!preset) return false;
  setSettings(preset);
  return true;
}

/**
 * Presets de transcricao. O terceiro caminho (`Servico local`) sobe um
 * servidor compativel com OpenAI na propria maquina — sem enviar audio para
 * fora e sem depender de comando externo.
 */
export const TRANSCRIPTION_PRESETS: Record<string, Record<string, string>> = {
  'Servico local (faster-whisper)': {
    'transcription.enabled': 'true',
    'transcription.provider': 'service',
    'transcription.service_url': 'http://127.0.0.1:9000/v1',
    'transcription.model': 'small'
  },
  'Servico local (no Docker)': {
    'transcription.enabled': 'true',
    'transcription.provider': 'service',
    'transcription.service_url': 'http://whisper:8000/v1',
    'transcription.model': 'small'
  },
  'OpenAI (nuvem)': {
    'transcription.enabled': 'true',
    'transcription.provider': 'openai',
    'transcription.base_url': 'https://api.openai.com/v1',
    'transcription.model': 'whisper-1'
  },
  'Comando local (whisper.cpp)': {
    'transcription.enabled': 'true',
    'transcription.provider': 'command',
    'transcription.command': 'whisper-cli -f {file} -otxt -of {out}'
  }
};

export function applyTranscriptionPreset(name: string): boolean {
  const preset = TRANSCRIPTION_PRESETS[name];
  if (!preset) return false;
  setSettings(preset);
  return true;
}

/** Remove chaves que nao existem mais nos defaults (higiene). */
export function pruneUnknownSettings(keys: string[]): void {
  if (keys.length === 0) return;
  getDb().delete(settings).where(inArray(settings.key, keys)).run();
}
