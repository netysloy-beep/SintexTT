import { Prisma, type GameEvent, type Player } from '@prisma/client';
import { RESOURCE_KINDS, type ResourceKind } from './catalog.js';
import { applyBps } from '../lib/money.js';

export type EventKind = 'DROUGHT' | 'STRIKE' | 'PRICE_SPIKE' | 'TAX_RAID';

export interface EventResponseDef {
  responseId: string;
  label: string;
  cost: bigint; // cents
  effect: string;
}

export interface EventDef {
  kind: EventKind;
  title: string;
  description: string;
  durationMinutes: number;
  responses: EventResponseDef[];
}

export const EVENT_DEFS: Record<EventKind, EventDef> = {
  DROUGHT: {
    kind: 'DROUGHT',
    title: 'Засуха',
    description: 'Фермы производят на 50% меньше. Заплатите за оросительную систему, чтобы остановить засуху.',
    durationMinutes: 120,
    responses: [{ responseId: 'irrigate', label: 'Оросительная система', cost: 20000n, effect: 'Снимает эффект засухи немедленно.' }],
  },
  STRIKE: {
    kind: 'STRIKE',
    title: 'Забастовка рабочих',
    description: 'Все производства работают на 70%. Выплатите премию, чтобы рабочие вернулись.',
    durationMinutes: 120,
    responses: [{ responseId: 'bonus', label: 'Премия рабочим', cost: 30000n, effect: 'Снимает эффект забастовки немедленно.' }],
  },
  PRICE_SPIKE: {
    kind: 'PRICE_SPIKE',
    title: 'Скачок цен',
    description: 'Спрос на один ресурс взлетел — цена выросла на 60%. Успейте продать излишки!',
    durationMinutes: 90,
    responses: [],
  },
  TAX_RAID: {
    kind: 'TAX_RAID',
    title: 'Налоговый рейд',
    description: 'Инспекция требует 10% капитала. Можно заплатить или дать взятку (4%, но растёт подозрение). Без реакции — штраф 15%.',
    durationMinutes: 60,
    responses: [
      { responseId: 'pay', label: 'Заплатить налог', cost: 0n, effect: 'Списывается 10% капитала.' },
      { responseId: 'bribe', label: 'Взятка', cost: 0n, effect: 'Списывается 4% капитала, +1 подозрение.' },
    ],
  },
};

export const EVENT_KINDS: EventKind[] = ['DROUGHT', 'STRIKE', 'PRICE_SPIKE', 'TAX_RAID'];

function pickRandom<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** Spawn a random force-majeure event for one player inside a tx. */
export async function spawnRandomEvent(
  tx: Prisma.TransactionClient,
  player: Player,
  now: Date,
  rng: () => number = Math.random,
): Promise<GameEvent> {
  // Do not stack: at most one unresolved event per player.
  const existing = await tx.gameEvent.findFirst({ where: { playerId: player.id, resolved: false } });
  if (existing) return existing;

  const kind = pickRandom(EVENT_KINDS, rng);
  const def = EVENT_DEFS[kind];
  const payload: Record<string, string | number> = {};
  if (kind === 'PRICE_SPIKE') {
    const resource = pickRandom(RESOURCE_KINDS, rng);
    payload.resource = resource;
    const row = await tx.marketPrice.findUnique({ where: { kind: resource } });
    if (row) {
      const spiked = (row.price * 16000n) / 10000n;
      await tx.marketPrice.update({ where: { kind: resource }, data: { price: spiked } });
    }
  }
  if (kind === 'TAX_RAID') {
    payload.taxBps = 1000;
    payload.bribeBps = 400;
    payload.penaltyBps = 1500;
  }
  return tx.gameEvent.create({
    data: {
      playerId: player.id,
      kind,
      payload,
      expiresAt: new Date(now.getTime() + def.durationMinutes * 60 * 1000),
    },
  });
}

/**
 * Apply a player's response to an active event inside a tx.
 * Throws Error strings that the route layer maps to HTTP codes.
 */
export async function respondToEvent(
  tx: Prisma.TransactionClient,
  player: Player,
  event: GameEvent,
  responseId: string,
  now: Date,
): Promise<{ money: bigint; message: string }> {
  const def = EVENT_DEFS[event.kind as EventKind];
  if (!def) throw new Error('UNKNOWN_EVENT');
  if (event.resolved) throw new Error('EVENT_ALREADY_RESOLVED');
  if (event.expiresAt <= now) throw new Error('EVENT_EXPIRED');
  if (event.response) throw new Error('EVENT_ALREADY_ANSWERED');

  const resp = def.responses.find((r) => r.responseId === responseId);
  if (!resp) throw new Error('UNKNOWN_RESPONSE');

  let money = player.money;
  let message: string;
  if (event.kind === 'TAX_RAID') {
    if (responseId === 'pay') {
      const tax = applyBps(money, 1000);
      money -= tax;
      message = `Налог уплачен: списано ${(tax / 100n).toString()} ден. ед.`;
    } else {
      const bribe = applyBps(money, 400);
      money -= bribe;
      await tx.player.update({ where: { id: player.id }, data: { suspicion: { increment: 1 } } });
      message = `Взятка принята: списано ${(bribe / 100n).toString()} ден. ед. Подозрение растёт.`;
    }
  } else {
    if (money < resp.cost) throw new Error('INSUFFICIENT_FUNDS');
    money -= resp.cost;
    message = `${def.title}: эффект снят.`;
  }

  await tx.gameEvent.update({
    where: { id: event.id },
    data: { response: responseId, resolved: true },
  });
  return { money, message };
}

/**
 * Resolve expired unresolved events (worker). TAX_RAID without a response
 * auto-charges the penalty. Others just expire.
 */
export async function resolveExpiredEvents(tx: Prisma.TransactionClient, now: Date): Promise<number> {
  const expired = await tx.gameEvent.findMany({
    where: { resolved: false, expiresAt: { lte: now } },
    include: { player: true },
    take: 500,
  });
  let changed = 0;
  for (const ev of expired) {
    if (ev.kind === 'TAX_RAID' && ev.response === null) {
      const penalty = applyBps(ev.player.money, 1500);
      await tx.player.update({
        where: { id: ev.playerId },
        data: { money: ev.player.money - penalty },
      });
    }
    await tx.gameEvent.update({ where: { id: ev.id }, data: { resolved: true } });
    changed += 1;
  }
  return changed;
}
