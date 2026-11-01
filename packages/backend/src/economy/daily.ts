import { Prisma, type Player } from '@prisma/client';

const BASE_REWARD = 5000n; // $50.00
const STREAK_STEP = 2500n; // +$25 per streak day
const MAX_REWARD = 30000n; // $300 cap

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isYesterday(last: Date, now: Date): boolean {
  const y = new Date(now.getTime() - 24 * 3600 * 1000);
  return utcDay(last) === utcDay(y);
}

/** Compute the daily reward and next streak without touching the DB. */
export function computeDaily(player: Pick<Player, 'lastDailyAt' | 'streak'>, now: Date): { reward: bigint; streak: number; alreadyClaimed: boolean } {
  if (player.lastDailyAt && utcDay(player.lastDailyAt) === utcDay(now)) {
    return { reward: 0n, streak: player.streak, alreadyClaimed: true };
  }
  const nextStreak = player.lastDailyAt && isYesterday(player.lastDailyAt, now) ? player.streak + 1 : 1;
  const raw = BASE_REWARD + STREAK_STEP * BigInt(nextStreak - 1);
  return { reward: raw > MAX_REWARD ? MAX_REWARD : raw, streak: nextStreak, alreadyClaimed: false };
}

/** Claim the daily bonus inside a transaction (idempotent per UTC day). */
export async function claimDaily(tx: Prisma.TransactionClient, player: Player, now: Date): Promise<{ reward: bigint; streak: number }> {
  const { reward, streak, alreadyClaimed } = computeDaily(player, now);
  if (alreadyClaimed) throw new Error('ALREADY_CLAIMED_TODAY');
  await tx.player.update({
    where: { id: player.id },
    data: { money: player.money + reward, streak, lastDailyAt: now },
  });
  return { reward, streak };
}
