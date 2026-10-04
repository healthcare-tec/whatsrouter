import { createApp } from './app.js';
import { log } from './logger.js';
import { purgeExpiredSessions } from './api/auth.js';
import { listenInfo, resolveListen } from './net/addresses.js';
import { pruneEvents } from './store.js';

async function main(): Promise<void> {
  const { app, shutdown, setRunningAddress, onRestartRequested } = await createApp();

  // O endereco vem do painel (Configuracoes > Rede e acesso) e, na falta dele,
  // das variaveis de ambiente HOST/PORT.
  const { host, port } = resolveListen();

  const server = app.listen(port, host, () => {
    setRunningAddress(host, port);
    const info = listenInfo();
    log.info(`Painel e API escutando em ${host}:${port}`);
    for (const entry of info.urls) log.info(`  ${entry.label}: ${entry.url}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      log.error(`A porta ${port} ja esta em uso. Ajuste PORT ou o campo de porta no painel.`);
    } else if (error.code === 'EADDRNOTAVAIL') {
      log.error(
        `O endereco ${host} nao existe nesta maquina. Use 0.0.0.0, 127.0.0.1 ou um IP listado em Configuracoes > Rede e acesso.`
      );
    } else {
      log.error('Falha ao abrir a porta', error);
    }
    process.exit(1);
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

  // O painel pode pedir reinicio para aplicar endereco/porta novos. Funciona
  // quando existe um supervisor (docker-compose com restart: unless-stopped,
  // systemd, pm2...). Sem supervisor, o processo apenas encerra.
  onRestartRequested(() => {
    log.warn('Reinicio solicitado pelo painel; encerrando para o supervisor subir de novo.');
    void graceful('RESTART');
  });

  process.on('SIGINT', () => void graceful('SIGINT'));
  process.on('SIGTERM', () => void graceful('SIGTERM'));
  process.on('unhandledRejection', (reason) => log.error('Promessa rejeitada sem tratamento', reason));
}

void main().catch((error) => {
  log.error('Falha fatal na inicializacao', error);
  process.exit(1);
});
