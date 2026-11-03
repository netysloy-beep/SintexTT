import { Prisma, type GameEvent, type PlayerBooster, type PlayerTech } from '@prisma/client';
import { BASE_PRICES, RESOURCE_KINDS, type ResourceKind } from './catalog.js';
import { addSpread, subSpread } from '../lib/money.js';
import { getResource, addResource, type ResourceMap } from './engine.js';

export const LIQUIDITY = 500n; // units: how much volume moves the price by 100%
const PRICE_MIN_BPS = 2500n; // price floor: 25% of base
const PRICE_MAX_BPS = 40000n; // price cap: 400% of base
const SPREAD_BPS = 800; // 8% default spread
const SPREAD_TRADING_BPS = 400; // with `trading` tech
const SPREAD_ORACLE_BPS = 100; // with active market_oracle booster

/** Current spread in bps given techs and boosters. */
export function currentSpreadBps(techs: PlayerTech[], boosters: PlayerBooster[], now: Date): number {
  const oracle = boosters.some((b) => b.boosterId === 'market_oracle' && b.expiresAt > now);
  if (oracle) return SPREAD_ORACLE_BPS;
  if (techs.some((t) => t.techId === 'trading')) return SPREAD_TRADING_BPS;
  return SPREAD_BPS;
}

function clampPrice(kind: string, price: bigint): bigint {
  const base = BASE_PRICES[kind as ResourceKind] ?? 1n;
  const min = (base * PRICE_MIN_BPS) / 10000n;
  const max = (base * PRICE_MAX_BPS) / 10000n;
  if (price < min) return min;
  if (price > max) return max;
  return price;
}

/** New market price after a trade of `qty` units (impact model, BigInt). */
export function priceAfterTrade(kind: string, price: bigint, qty: bigint, side: 'buy' | 'sell'): bigint {
  const impact = (price * qty) / LIQUIDITY;
  const moved = side === 'buy' ? price + impact : price - impact;
  return clampPrice(kind, moved);
}

export interface TradeQuote {
  unitPrice: bigint;
  total: bigint;
  newMarketPrice: bigint;
}

export function quoteBuy(kind: string, price: bigint, qty: bigint, spreadBps: number): TradeQuote {
  const unit = addSpread(price, spreadBps);
  return { unitPrice: unit, total: unit * qty, newMarketPrice: priceAfterTrade(kind, price, qty, 'buy') };
}

export function quoteSell(kind: string, price: bigint, qty: bigint, spreadBps: number): TradeQuote {
  const unit = subSpread(price, spreadBps);
  return { unitPrice: unit, total: unit * qty, newMarketPrice: priceAfterTrade(kind, price, qty, 'sell') };
}

/** Drift tick used by the worker: pull 1% toward base, +/- deterministic wiggle. */
export function driftTick(prices: { kind: string; price: bigint }[], tickIndex: number): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const { kind, price } of prices) {
    const base = BASE_PRICES[kind as ResourceKind];
    if (!base) continue;
    // wiggle: deterministic pseudo-noise in [-1%, +1%] based on tickIndex
    const w = ((tickIndex * 2654435761) % 2001) - 1000; // -1000..1000
    const wiggleBps = Math.trunc(w / 10); // -100..100 bps, always an integer
    const towardBase = price + (base - price) / 100n;
    const moved = towardBase + (towardBase * BigInt(wiggleBps)) / 10000n;
    out.set(kind, clampPrice(kind, moved < 1n ? 1n : moved));
  }
  return out;
}

export interface MarketRow {
  kind: string;
  price: bigint;
  buyUnit: bigint;
  sellUnit: bigint;
  history: { t: string; price: number }[];
}

/** Execute a server-side market trade inside a transaction. Returns deltas. */
export async function executeTrade(
  tx: Prisma.TransactionClient,
  playerId: string,
  kind: string,
  qty: bigint,
  side: 'buy' | 'sell',
  spreadBps: number,
  resources: ResourceMap,
  money: bigint,
): Promise<{ money: bigint; newPrice: bigint; unitPrice: bigint; total: bigint }> {
  if (!RESOURCE_KINDS.includes(kind as ResourceKind)) throw new Error('UNKNOWN_RESOURCE');
  if (qty <= 0n) throw new Error('INVALID_QTY');
  if (qty > 100000n) throw new Error('QTY_TOO_LARGE');

  const row = await tx.marketPrice.findUnique({ where: { kind } });
  if (!row) throw new Error('PRICE_NOT_FOUND');
  const price = row.price;

  let unitPrice: bigint;
  let total: bigint;
  if (side === 'buy') {
    unitPrice = addSpread(price, spreadBps);
    total = unitPrice * qty;
    if (money < total) throw new Error('INSUFFICIENT_FUNDS');
    money -= total;
    addResource(resources, kind, qty);
  } else {
    const stock = getResource(resources, kind);
    if (stock < qty) throw new Error('INSUFFICIENT_STOCK');
    unitPrice = subSpread(price, spreadBps);
    total = unitPrice * qty;
    money += total;
    addResource(resources, kind, -qty);
  }

  const newPrice = priceAfterTrade(kind, price, qty, side);
  await tx.marketPrice.update({ where: { kind }, data: { price: newPrice } });
  await tx.pricePoint.create({ data: { kind, price: newPrice } });

  return { money, newPrice, unitPrice, total };
}

/** Combined modifiers from active events, techs and boosters for the engine. */
export function collectModifiers(
  events: GameEvent[],
  techs: PlayerTech[],
  boosters: PlayerBooster[],
  now: Date,
): { productionBps: number; energyCostBps: number; throughputBps: number; wheatPenaltyBps: number } {
  let productionBps = 10000;
  let energyCostBps = 10000;
  let throughputBps = 10000;
  let wheatPenaltyBps = 10000;

  if (techs.some((t) => t.techId === 'automation')) productionBps += 2500;
  if (techs.some((t) => t.techId === 'insulation')) energyCostBps -= 2500;
  if (boosters.some((b) => b.boosterId === 'golden_gear' && b.expiresAt > now)) productionBps += 5000;

  for (const ev of events) {
    if (ev.resolved || ev.expiresAt <= now) continue;
    if (ev.kind === 'DROUGHT') wheatPenaltyBps = (wheatPenaltyBps * 5000) / 10000;
    if (ev.kind === 'STRIKE') throughputBps = (throughputBps * 7000) / 10000;
  }
  return { productionBps, energyCostBps, throughputBps, wheatPenaltyBps };
}

/** Effective truck count including boosters. */
export function effectiveTrucks(base: number, boosters: PlayerBooster[], now: Date): number {
  let trucks = base;
  if (boosters.some((b) => b.boosterId === 'union_charm' && b.expiresAt > now)) trucks += 2;
  return trucks;
}
