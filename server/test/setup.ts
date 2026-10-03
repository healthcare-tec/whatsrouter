import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Ambiente isolado para os testes: banco e dados em diretorio temporario.
 * Precisa rodar antes de qualquer import do codigo da aplicacao (ver
 * `setupFiles` no vitest.config.ts).
 */
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsrouter-test-'));

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATA_DIR = base;
process.env.DATABASE_PATH = path.join(base, 'test.sqlite');
process.env.SESSION_SECRET = 'test-secret';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'whatsrouter';

export const testDataDir = base;