import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionPlayer {
  id: string;
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
}

/** Create a session and return the raw token (shown once). */
export async function createSession(playerId: string, ttlHours: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: {
      playerId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
    },
  });
  return token;
}

export async function resolveSession(token: string): Promise<SessionPlayer | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { player: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.player;
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
