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
  TRANSCRIPTION_PRESETS,
  allSettings,
  applyMailPreset,
  applyTranscriptionPreset,
  getConfig,
  settingsForPanel,
  setSettings
} from '../settings/service.js';
import { sendTestEmail, verifySmtp } from '../mail/sender.js';
import { verifyImap } from '../mail/reader.js';
import { mediaUsage } from '../media/store.js';
import { checkTranscriptionService, describeDriver, resolveDriver } from '../media/transcribe.js';
import { listenInfo, listenWarnings } from '../net/addresses.js';
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
  /** Endereco em que o servidor esta escutando neste momento. */
  runningServer: () => { host: string; port: number };
  /** Encerra o processo para o supervisor (Docker/systemd) subir de novo. */
  restartServer: () => void;
}

function body<T = Record<string, unknown>>(req: Request): T {
  return (req.body ?? {}) as T;
}

/**
 * A API recebe `media.base64`; o provedor mock trabalha com Buffer. Assim o
 * modo demonstracao tambem exercita anexos e transcricao.
 */
function decodeSimulatedMedia(payload: Record<string, unknown>): Record<string, unknown> {
  const media = payload.media as { base64?: string; mimeType?: string; fileName?: string } | undefined;
  if (!media || typeof media.base64 !== 'string' || media.base64.length === 0) return payload;
  return {
    ...payload,
    media: {
      mimeType: media.mimeType,
      fileName: media.fileName,
      data: Buffer.from(media.base64, 'base64')
    }
  };
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
    const addressInfo = listenInfo();
    const running = ctx.runningServer();
    res.json({
      values: settingsForPanel(),
      defaults: SETTING_DEFAULTS,
      secrets: [...SECRET_KEYS],
      mailPresets: MAIL_PRESETS,
      mailPresetNames: Object.keys(MAIL_PRESETS),
      transcriptionPresets: TRANSCRIPTION_PRESETS,
      transcriptionPresetNames: Object.keys(TRANSCRIPTION_PRESETS),
      transcriptionDriver: resolveDriver(getConfig()),
      transcriptionDriverLabel: describeDriver(resolveDriver(getConfig())),
      server: {
        ...addressInfo,
        warnings: listenWarnings(addressInfo),
        running,
        pendingRestart: addressInfo.host !== running.host || addressInfo.port !== running.port
      },
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

  router.post('/settings/preset-transcription', requireAuth, async (req, res) => {
    const { name } = body<{ name?: string }>(req);
    if (!name || !applyTranscriptionPreset(name)) {
      res.status(400).json({ error: 'preset de transcricao desconhecido' });
      return;
    }
    await ctx.reloadEverything();
    logEvent('info', 'settings_changed', `Preset de transcricao aplicado: ${name}`);
    res.json({ ok: true });
  });

  /** Testa o caminho de transcricao configurado (servico local ou nuvem). */
  router.post('/settings/test-transcription', requireAuth, async (_req, res) => {
    const result = await checkTranscriptionService(getConfig());
    res.json({ ...result, label: describeDriver(result.driver) });
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

  /**
   * Gera um QR Code novo para a primeira conexao (Baileys). Util quando o QR
   * anterior expirou ou quando o provedor acabou de ser ligado.
   */
  router.post('/provider/qr', requireAuth, async (_req, res) => {
    const provider = ctx.currentProvider() as
      | { name?: string; requestQr?: () => Promise<unknown> }
      | null;
    if (!provider?.requestQr) {
      res.status(400).json({
        error: `o provedor ativo (${provider?.name ?? 'nenhum'}) nao gera QR Code`
      });
      return;
    }
    try {
      await provider.requestQr();
      logEvent('info', 'provider_qr', 'QR Code solicitado pelo painel');
      res.json({ ok: true, provider: ctx.providerStatus() });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Codigo de pareamento por telefone: alternativa ao QR Code. */
  router.post('/provider/pairing-code', requireAuth, async (req, res) => {
    const { phone } = body<{ phone?: string }>(req);
    const provider = ctx.currentProvider() as
      | { name?: string; pairingCode?: (value: string) => Promise<string> }
      | null;
    if (!provider?.pairingCode) {
      res.status(400).json({
        error: `o provedor ativo (${provider?.name ?? 'nenhum'}) nao gera codigo de pareamento`
      });
      return;
    }
    if (!phone) {
      res.status(400).json({ error: 'informe o telefone com DDI e DDD, por exemplo 5511999999999' });
      return;
    }
    try {
      const code = await provider.pairingCode(phone);
      logEvent('info', 'provider_pairing_code', 'Codigo de pareamento gerado pelo painel');
      res.json({ ok: true, code });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /* ------------------------------------------------------------------ */
  /* Rede e acesso                                                       */
  /* ------------------------------------------------------------------ */

  /** Endereco efetivo de escuta, URLs uteis e avisos de seguranca. */
  router.get('/server/addresses', requireAuth, (_req, res) => {
    const info = listenInfo();
    const running = ctx.runningServer();
    res.json({
      ...info,
      warnings: listenWarnings(info),
      running,
      pendingRestart: info.host !== running.host || info.port !== running.port
    });
  });

  /**
   * Reinicia o processo para aplicar o novo endereco/porta. Depende de um
   * supervisor (o `docker-compose.yml` do projeto usa `restart: unless-stopped`).
   */
  router.post('/server/restart', requireAuth, (_req, res) => {
    logEvent('warn', 'server_restart', 'Reinicio do servidor solicitado pelo painel');
    res.json({ ok: true });
    setTimeout(() => ctx.restartServer(), 300);
  });

  /** Simula uma mensagem recebida (apenas com o provedor mock). */
  router.post('/provider/simulate', requireAuth, (req, res) => {
    if (!(ctx.currentProvider() instanceof MockProvider)) {
      res.status(400).json({ error: 'disponivel apenas com o provedor mock' });
      return;
    }
    ctx.simulateInbound(decodeSimulatedMedia(body(req)));
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
