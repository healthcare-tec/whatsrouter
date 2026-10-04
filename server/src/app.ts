import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { ensureAdminUser } from './auth/bootstrap.js';
import { createRoutes } from './api/routes.js';
import { initDb } from './db/client.js';
import { env, panelDir } from './env.js';
import { log } from './logger.js';
import { MailReader } from './mail/reader.js';
import { MockProvider } from './providers/mock.js';
import { providerManager } from './providers/index.js';
import { ConsolidationScheduler } from './router/consolidation.js';
import { MessageIngest } from './router/ingest.js';
import { ReplyHandler } from './router/replyHandler.js';
import { getConfig } from './settings/service.js';
import { logEvent } from './store.js';

export interface WhatsRouterApp {
  app: Express;
  ingest: MessageIngest;
  scheduler: ConsolidationScheduler;
  mailReader: MailReader;
  reloadEverything: () => Promise<void>;
  /** Informa ao painel em que endereco o servidor realmente esta escutando. */
  setRunningAddress: (host: string, port: number) => void;
  /** Registra o que fazer quando o painel pede reinicio. */
  onRestartRequested: (handler: () => void) => void;
  shutdown: () => Promise<void>;
}

export async function createApp(): Promise<WhatsRouterApp> {
  initDb();
  ensureAdminUser();

  const running = { host: env.HOST, port: env.PORT };
  let restartHandler: (() => void) | null = null;

  const provider = await providerManager.init();
  const getProvider = () => providerManager.currentOrNull();

  const ingest = new MessageIngest(getProvider);
  ingest.attach(provider);

  const replyHandler = new ReplyHandler(getProvider);
  const scheduler = new ConsolidationScheduler(getProvider);
  scheduler.start();

  const mailReader = new MailReader(() => getConfig(), (reply) => replyHandler.handle(reply));
  await mailReader.start();

  const reloadEverything = async (): Promise<void> => {
    const current = await providerManager.reload();
    ingest.attach(current);
    scheduler.reload();
    await mailReader.reload();
    log.info('Configuracoes aplicadas (provedor, agendador e e-mail recarregados)');
  };

  const routes = createRoutes({
    reloadEverything,
    providerStatus: () => providerManager.currentOrNull()?.status() ?? null,
    providerRestart: async () => {
      await reloadEverything();
      return providerManager.current().status();
    },
    providerLogout: async () => {
      await providerManager.currentOrNull()?.logout?.();
      return providerManager.currentOrNull()?.status() ?? null;
    },
    providerSend: (jid, payload) => providerManager.current().send(jid, { text: payload.text }),
    currentProvider: () => providerManager.currentOrNull(),
    mailStatus: () => mailReader.status(),
    mailReload: () => mailReader.reload(),
    flushConversation: (id) => scheduler.flushConversationById(id),
    simulateInbound: (payload) => {
      const current = providerManager.currentOrNull();
      if (current instanceof MockProvider) {
        current.simulateInbound(payload as never);
      }
    },
    runningServer: () => ({ ...running }),
    restartServer: () => {
      if (restartHandler) restartHandler();
      else log.warn('Reinicio solicitado, mas nenhum supervisor foi registrado; encerrando mesmo assim.');
    }
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser(env.SESSION_SECRET));
  app.use('/api', routes);

  if (fs.existsSync(panelDir)) {
    app.use(express.static(panelDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(panelDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .send(
          '<h1>WhatsRouter</h1><p>Painel nao compilado. Rode <code>pnpm build</code> ou acesse a API em <code>/api/status</code>.</p>'
        );
    });
  }

  logEvent('info', 'startup', `WhatsRouter iniciado (provedor: ${provider.name})`);

  return {
    app,
    ingest,
    scheduler,
    mailReader,
    reloadEverything,
    setRunningAddress: (host, port) => {
      running.host = host;
      running.port = port;
    },
    onRestartRequested: (handler) => {
      restartHandler = handler;
    },
    shutdown: async () => {
      scheduler.stop();
      await mailReader.stop();
      await providerManager.stop();
      log.info('WhatsRouter encerrado');
    }
  };
}
