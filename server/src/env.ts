import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_PATH: z.string().default('./data/whatsrouter.sqlite'),
  DATA_DIR: z.string().default('./data'),
  SESSION_SECRET: z.string().default('whatsrouter-dev-secret-change-me'),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('whatsrouter'),
  WHATSAPP_PROVIDER: z.enum(['baileys', 'webhook', 'mock']).default('baileys'),
  LOG_LEVEL: z.string().default('info'),
  WEBHOOK_TOKEN: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_BASE_URL: z.string().default('')
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Configuracao invalida:', parsed.error.flatten().fieldErrors);
  throw new Error('Variaveis de ambiente invalidas');
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const dataDir = path.resolve(env.DATA_DIR);
export const databasePath = path.resolve(env.DATABASE_PATH);
export const mediaDir = path.join(dataDir, 'media');
export const sessionDir = path.join(dataDir, 'whatsapp-session');
export const panelDir = path.resolve(process.cwd(), 'web', 'dist');