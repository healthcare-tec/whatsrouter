import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/client.js';
import { contacts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { env } from '../env.js';
import { log } from '../logger.js';
import {
  MAIL_PRESETS,
  SECRET_KEYS,
  SETTING_DEFAULTS,
  allSettings,
  applyMailPreset,
  getConfig,
  settingsForPanel,
  setSettings
} from '../settings/service.js';
import { sendTestEmail, verifySmtp } from '../mail/sender.js';
import { verifyImap } from '../mail/reader.js';
import { mediaUsage } from '../media/store.js';
import { resolveDriver } from '../media/transcribe.js';
import {
  countPendingMessages,
  dashboardStats,
  getConversationByJid,
  getConversationById,
  getContactByJid,
  listConversations,
  listEvents,
  listInboundEmails,
  listMessages,
  listOutbox,
  logEvent,
  setContactBlocked,
  insertMessage,
  touchConversation
} from '../store.js';
import { pauseConversation, resumeAllConversations, resumeConversation, setGlobalPause, pauseAllConversations } from '../router/pause.js';
import { WebhookProvider } from '../providers/webhook.js';
import { MockProvider } from '../providers/mock.js';
import { currentUser, createSession, destroySession, requireAuth, SESSION_COOKIE, cookieOptions } from './auth.js';
import { findUserByUsername, updatePassword, verifyPassword } from '../auth/bootstrap.js';

export interface RoutesContext {
  reloadEverything: () => Promise<void>;
  providerStatus: () => unknown;
  providerRestart: () => Promise<unknown>;
  providerLogout: () => Promise<unknown>;
  providerSend: (jid: string, payload: { text?: string }) => Promise<{ id: string }>;
  currentProvider: () => unknown;
  mailStatus: () => unknown;
  mailReload: () => Promise<void>;
  flushConversation: (id: number) => Promise<boolean>;
  simulateInbound: (payload: Record<string, unknown>) => void;
}

function body<T = Record<string, unknown>>(req: Request): T {
  return (req.body ?? {}) as T;
}

export function createRoutes(ctx: RoutesContext): Router {
  const router = Router();

  /* ------------------------------------------------------------------ */
  /* Autenticacao                                                        */
  /* ------------------------------------------------------------------ */

  router.post('/auth/login', (req, res) => {
    const { username, password } = body<{ username?: string; password?: string }>(req);
    if (!username || !password) {
      res.status(400).json({ error: 'informe usuario e senha' });
      return;
    }
    const user = findUserByUsername(username);
    if (!user || !verifyPassword(user, password)) {
      logEvent('warn', 'login_failed', `Tentativa de login invalida para "${username}"`);
      res.status(401).json({ error: 'usuario ou senha invalidos' });
      return;
    }
    const session = createSession({ id: user.id, username: user.username });
    res.cookie(SESSION_COOKIE, session.token, cookieOptions());
    logEvent('info', 'login', `Login do painel: ${user.username}`);
    res.json({ user: { id: user.id, username: user.username } });
  });

  router.post('/auth/logout', (req, res) => {
    const token = (req.cookies ?? {})[SESSION_COOKIE] as string | undefined;
    if (token) destroySession(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/auth/me', (req, res) => {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'nao autenticado' });
      return;
    }
    res.json({ user });
  });

  router.post('/auth/password', requireAuth, (req, res) => {
    const { current, next } = body<{ current?: string; next?: string }>(req);
    const user = currentUser(req)!;
    const stored = findUserByUsername(user.username);
    if (!stored || !current || !next) {
      res.status(400).json({ error: 'informe a senha atual e a nova senha' });
      return;
    }
    if (!verifyPassword(stored, current)) {
      res.status(401).json({ error: 'senha atual invalida' });
      return;
    }
    if (next.length < 6) {
      res.status(400).json({ error: 'a nova senha deve ter ao menos 6 caracteres' });
      return;
    }
    updatePassword(stored.id, next);
    logEvent('info', 'password_changed', `Senha do painel alterada por ${user.username}`);
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------------ */
  /* Configuracoes                                                       */
  /* ------------------------------------------------------------------ */

  router.get('/settings', requireAuth, (_req, res) => {
    res.json({
      values: settingsForPanel(),
      defaults: SETTING_DEFAULTS,
      secrets: [...SECRET_KEYS],
      mailPresets: MAIL_PRESETS,
      mailPresetNames: Object.keys(MAIL_PRESETS),
      transcriptionDriver: resolveDriver(getConfig()),
      envProvider: env.WHATSAPP_PROVIDER
    });
  });

  router.put('/settings', requireAuth, async (req, res) => {
    const { values } = body<{ values?: Record<string, unknown> }>(req);
    if (!values || typeof values !== 'object') {
      res.status(400).json({ error: 'envie { values: { chave: valor } }' });
      return;
    }
    const changed = setSettings(values);
    await ctx.reloadEverything();
    logEvent('info', 'settings_changed', `Configuracoes atualizadas: ${changed.join(', ') || 'nada'}`);
    res.json({ ok: true, changed });
  });

  router.post('/settings/preset', requireAuth, async (req, res) => {
    const { name } = body<{ name?: string }>(req);
    if (!name || !applyMailPreset(name)) {
      res.status(400).json({ error: 'preset desconhecido' });
      return;
    }
    await ctx.reloadEverything();
    res.json({ ok: true });
  });

  router.post('/settings/test-email', requireAuth, async (req, res) => {
    const { to } = body<{ to?: string }>(req);
    const config = getConfig();
    const target = to || config.mail.ownerEmail;
    if (!target) {
      res.status(400).json({ error: 'informe um destinatario' });
      return;
    }
    try {
      await sendTestEmail(config, target);
      res.json({ ok: true, to: target });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/settings/test-smtp', requireAuth, async (_req, res) => {
    res.json(await verifySmtp(getConfig()));
  });

  router.post('/settings/test-imap', requireAuth, async (_req, res) => {
    res.json(await verifyImap(getConfig()));
  });

  /* ------------------------------------------------------------------ */
  /* Status                                                              */
  /* ------------------------------------------------------------------ */

  router.get('/status', requireAuth, (_req, res) => {
    res.json({
      provider: ctx.providerStatus(),
      mail: ctx.mailStatus(),
      stats: dashboardStats(),
      media: mediaUsage(),
      transcription: resolveDriver(getConfig()),
      pause: { global: getConfig().pause.global, reason: getConfig().pause.globalReason },
      runtime: {
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
      }
    });
  });

  router.post('/provider/restart', requireAuth, async (_req, res) => {
    await ctx.providerRestart();
    res.json({ ok: true, provider: ctx.providerStatus() });
  });

  router.post('/provider/logout', requireAuth, async (_req, res) => {
    await ctx.providerLogout();
    res.json({ ok: true, provider: ctx.providerStatus() });
  });

  /** Simula uma mensagem recebida (apenas com o provedor mock). */
  router.post('/provider/simulate', requireAuth, (req, res) => {
    if (!(ctx.currentProvider() instanceof MockProvider)) {
      res.status(400).json({ error: 'disponivel apenas com o provedor mock' });
      return;
    }
    ctx.simulateInbound(body(req));
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------------ */
  /* Conversas                                                           */
  /* ------------------------------------------------------------------ */

  router.get('/conversations', requireAuth, (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    res.json({ conversations: listConversations({ search }) });
  });

  router.get('/conversations/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const conversation = getConversationById(id);
    if (!conversation) {
      res.status(404).json({ error: 'conversa nao encontrada' });
      return;
    }
    const contact = getContactByJid(conversation.jid);
    res.json({
      conversation,
      contact,
      pending: countPendingMessages(id),
      paused: conversation.pausedUntil ? new Date(conversation.pausedUntil).getTime() > Date.now() : false,
      messages: listMessages(id, 300)
    });
  });

  router.post('/conversations/:id/pause', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const { minutes } = body<{ minutes?: number }>(req);
    const used = minutes && minutes > 0 ? minutes : getConfig().pause.autoMinutes;
    pauseConversation(id, used, 'panel');
    res.json({ ok: true, minutes: used });
  });

  router.post('/conversations/:id/resume', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    resumeConversation(id, 'panel');
    await ctx.flushConversation(id);
    res.json({ ok: true });
  });

  router.post('/conversations/:id/flush', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const sent = await ctx.flushConversation(id);
    res.json({ ok: true, sent });
  });

  router.post('/conversations/:id/send', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { text } = body<{ text?: string }>(req);
    const conversation = getConversationById(id);
    if (!conversation || !text?.trim()) {
      res.status(400).json({ error: 'conversa ou texto invalido' });
      return;
    }
    try {
      const result = await ctx.providerSend(conversation.jid, { text: text.trim() });
      insertMessage({
        conversationId: id,
        waMessageId: result.id || null,
        direction: 'out',
        source: 'manual',
        kind: 'text',
        text: text.trim(),
        messageTimestamp: new Date()
      });
      touchConversation(id, { lastActivityAt: new Date() });
      res.json({ ok: true, id: result.id });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/conversations/:id/block', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const { blocked } = body<{ blocked?: boolean }>(req);
    const conversation = getConversationById(id);
    if (!conversation) {
      res.status(404).json({ error: 'conversa nao encontrada' });
      return;
    }
    setContactBlocked(conversation.jid, Boolean(blocked));
    logEvent('info', 'block_changed', `${conversation.jid} ${blocked ? 'bloqueado' : 'desbloqueado'}`);
    res.json({ ok: true });
  });

  router.get('/contacts', requireAuth, (_req, res) => {
    res.json({ contacts: getDb().select().from(contacts).all() });
  });

  router.post('/contacts/:jid/block', requireAuth, (req, res) => {
    const jid = decodeURIComponent(String(req.params.jid));
    const { blocked } = body<{ blocked?: boolean }>(req);
    setContactBlocked(jid, Boolean(blocked));
    res.json({ ok: true });
  });

  /* ------------------------------------------------------------------ */
  /* Pausa global                                                        */
  /* ------------------------------------------------------------------ */

  router.post('/pause/global', requireAuth, (req, res) => {
    const { paused, reason } = body<{ paused?: boolean; reason?: string }>(req);
    setGlobalPause(Boolean(paused), reason ?? '');
    res.json({ ok: true, paused: Boolean(paused) });
  });

  router.post('/pause/all', requireAuth, (req, res) => {
    const { minutes } = body<{ minutes?: number }>(req);
    const total = pauseAllConversations(minutes);
    res.json({ ok: true, conversations: total });
  });

  router.post('/pause/resume-all', requireAuth, (req, res) => {
    void req;
    const total = resumeAllConversations();
    res.json({ ok: true, conversations: total });
  });

  /* ------------------------------------------------------------------ */
  /* Historico                                                           */
  /* ------------------------------------------------------------------ */

  router.get('/outbox', requireAuth, (_req, res) => {
    res.json({ outbox: listOutbox(100) });
  });

  router.get('/inbound-emails', requireAuth, (_req, res) => {
    res.json({ inboundEmails: listInboundEmails(100) });
  });

  router.get('/events', requireAuth, (req, res) => {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const limit = Number(req.query.limit ?? 200);
    res.json({ events: listEvents({ level, search, limit: Number.isFinite(limit) ? limit : 200 }) });
  });

  /* ------------------------------------------------------------------ */
  /* Webhook (provedor externo / n8n)                                    */
  /* ------------------------------------------------------------------ */

  router.post('/webhook/whatsapp', (req, res) => {
    const token = getConfig().provider.webhookInboundToken || env.WEBHOOK_TOKEN;
    const provided = String(req.headers['x-whatsrouter-token'] ?? req.query.token ?? '');
    if (!token || provided !== token) {
      res.status(401).json({ error: 'token invalido' });
      return;
    }
    const provider = ctx.currentProvider();
    if (!(provider instanceof WebhookProvider)) {
      res.status(400).json({ error: 'o provedor ativo nao e o webhook' });
      return;
    }
    try {
      provider.handleInbound(body(req));
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Saude                                                               */
  /* ------------------------------------------------------------------ */

  router.get('/healthz', (_req: Request, res: Response) => {
    const provider = ctx.providerStatus() as { state?: string };
    res.json({
      ok: true,
      provider: provider?.state ?? 'unknown',
      uptimeSeconds: Math.round(process.uptime()),
      settingsLoaded: Object.keys(allSettings()).length
    });
  });

  return router;
}
