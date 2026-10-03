import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { authUsers, sessions } from '../db/schema.js';

export const SESSION_COOKIE = 'wr_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  username: string;
}

export function createSession(user: SessionUser): { token: string; expiresAt: Date } {
  const db = getDb();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.insert(sessions).values({ token, userId: user.id, createdAt: new Date(), expiresAt }).run();
  return { token, expiresAt };
}

export function destroySession(token: string): void {
  getDb().delete(sessions).where(eq(sessions.token, token)).run();
}

export function sessionFromToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .get();
  if (!row) return null;

  const user = db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, row.userId))
    .get();

  if (!user) return null;
  return { id: user.id, username: user.username };
}

export function purgeExpiredSessions(): void {
  getDb().delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
}

/** Middleware que exige sessao valida. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  const user = sessionFromToken(token);
  if (!user) {
    res.status(401).json({ error: 'nao autenticado' });
    return;
  }
  (req as Request & { user?: SessionUser }).user = user;
  next();
}

export function currentUser(req: Request): SessionUser | null {
  const token = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  return sessionFromToken(token);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false,
    maxAge: SESSION_TTL_MS,
    path: '/'
  };
}
