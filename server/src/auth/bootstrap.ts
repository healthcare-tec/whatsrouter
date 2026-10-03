import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { authUsers } from '../db/schema.js';
import { env } from '../env.js';
import { log } from '../logger.js';

/**
 * Garante que exista um usuario do painel. Na primeira execucao usa
 * ADMIN_USERNAME/ADMIN_PASSWORD (padrao admin/whatsrouter) e avisa no log.
 */
export function ensureAdminUser(): void {
  const db = getDb();
  const existing = db.select().from(authUsers).limit(1).get();
  if (existing) return;

  const passwordHash = bcrypt.hashSync(env.ADMIN_PASSWORD, 10);
  db.insert(authUsers)
    .values({ username: env.ADMIN_USERNAME, passwordHash, createdAt: new Date() })
    .run();

  log.warn(
    `Usuario do painel criado: ${env.ADMIN_USERNAME} (senha inicial "${env.ADMIN_PASSWORD}"). Troque a senha em Configuracoes > Acesso.`
  );
}

export function findUserByUsername(username: string) {
  return getDb().select().from(authUsers).where(eq(authUsers.username, username)).get();
}

export function verifyPassword(user: { passwordHash: string }, password: string): boolean {
  return bcrypt.compareSync(password, user.passwordHash);
}

export function updatePassword(userId: number, password: string): void {
  getDb()
    .update(authUsers)
    .set({ passwordHash: bcrypt.hashSync(password, 10) })
    .where(eq(authUsers.id, userId))
    .run();
}