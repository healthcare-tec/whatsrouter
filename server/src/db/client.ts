import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { databasePath, dataDir, mediaDir, sessionDir } from '../env.js';
import { log } from '../logger.js';
import * as schema from './schema.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDir, '../../drizzle');

let sqlite: Database.Database | null = null;
let database: BetterSQLite3Database<typeof schema> | null = null;

/** Garante que os diretorios de trabalho existam. */
export function ensureDirectories(): void {
  for (const dir of [dataDir, mediaDir, sessionDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** Abre o banco (idempotente) e aplica as migracoes pendentes. */
export function initDb(): BetterSQLite3Database<typeof schema> {
  if (database) return database;

  ensureDirectories();
  sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  database = drizzle(sqlite, { schema });

  if (fs.existsSync(migrationsFolder)) {
    try {
      migrate(database, { migrationsFolder });
    } catch (error) {
      log.error('Falha ao aplicar migracoes', error);
      throw error;
    }
  } else {
    log.warn(
      `Pasta de migracoes nao encontrada em ${migrationsFolder}. Rode "pnpm db:generate" antes de iniciar.`
    );
  }

  log.info(`Banco SQLite em ${databasePath}`);
  return database;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!database) return initDb();
  return database;
}

export function closeDb(): void {
  sqlite?.close();
  sqlite = null;
  database = null;
}

export { schema };