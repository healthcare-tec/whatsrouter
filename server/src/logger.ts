import { pino } from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined
});

// pino-pretty e opcional: se nao estiver instalado, usa o logger padrao.
export const log = {
  info: (msg: string, meta?: unknown) => logger.info(meta ?? {}, msg),
  warn: (msg: string, meta?: unknown) => logger.warn(meta ?? {}, msg),
  error: (msg: string, meta?: unknown) => logger.error(meta ?? {}, msg),
  debug: (msg: string, meta?: unknown) => logger.debug(meta ?? {}, msg)
};