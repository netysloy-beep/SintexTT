import { Prisma, type Player } from '@prisma/client';

export interface EnsurePlayerInput {
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
  referrerTelegramId: bigint | null;
}

export const REFERRAL_BONUS = 50000n; // $500 for both sides
const STARTER_BUILDINGS = ['farm', 'lumberCamp', 'powerPlant'];

/**
 * Upsert a player by Telegram id inside a transaction.
 * New players receive a starter kit; referral bonuses are paid once.
 */
export async function ensurePlayer(tx: Prisma.TransactionClient, input: EnsurePlayerInput): Promise<Player> {
  const existing = await tx.player.findUnique({ where: { telegramId: input.telegramId } });
  if (existing) {
    return tx.player.update({
      where: { id: existing.id },
      data: { username: input.username, firstName: input.firstName },
    });
  }

  const player = await tx.player.create({
    data: {
      telegramId: input.telegramId,
      username: input.username,
      firstName: input.firstName,
    },
  });
  for (const kind of STARTER_BUILDINGS) {
    await tx.building.create({ data: { playerId: player.id, kind, level: 1, assignedWorkers: 0 } });
  }

  if (input.referrerTelegramId !== null && input.referrerTelegramId !== input.telegramId) {
    const referrer = await tx.player.findUnique({ where: { telegramId: input.referrerTelegramId } });
    if (referrer) {
      await tx.player.update({
        where: { id: player.id },
        data: { referredBy: referrer.id, money: { increment: REFERRAL_BONUS } },
      });
      await tx.player.update({
        where: { id: referrer.id },
        data: { money: { increment: REFERRAL_BONUS } },
      });
    }
  }
  const fresh = await tx.player.findUniqueOrThrow({ where: { id: player.id } });
  return fresh;
}
