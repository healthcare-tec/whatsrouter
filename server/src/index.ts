import { createApp } from './app.js';
import { env } from './env.js';
import { log } from './logger.js';
import { purgeExpiredSessions } from './api/auth.js';
import { pruneEvents } from './store.js';

async function main(): Promise<void> {
  const { app, shutdown } = await createApp();

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    log.info(`Painel e API em http://localhost:${env.PORT}`);
  });

  // Higiene periodica: sessoes vencidas e log de eventos muito grande.
  const housekeeping = setInterval(() => {
    try {
      purgeExpiredSessions();
      pruneEvents(5000);
    } catch (error) {
      log.warn('Falha na manutencao periodica', error);
    }
  }, 60 * 60 * 1000);

  const graceful = async (signal: string) => {
    log.info(`Recebido ${signal}; encerrando...`);
    clearInterval(housekeeping);
    server.close();
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void graceful('SIGINT'));
  process.on('SIGTERM', () => void graceful('SIGTERM'));
  process.on('unhandledRejection', (reason) => log.error('Promessa rejeitada sem tratamento', reason));
}

void main().catch((error) => {
  log.error('Falha fatal na inicializacao', error);
  process.exit(1);
});