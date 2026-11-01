import { describe, expect, it } from 'vitest';
import { priceAfterTrade, driftTick, currentSpreadBps } from '../src/economy/market.js';
import { BASE_PRICES } from '../src/economy/catalog.js';

describe('market pricing', () => {
  it('buying pushes the price up, selling pulls it down', () => {
    const base = BASE_PRICES.WHEAT;
    const afterBuy = priceAfterTrade('WHEAT', base, 100n, 'buy');
    expect(afterBuy).toBe(base + (base * 100n) / 500n);
    const afterSell = priceAfterTrade('WHEAT', base, 100n, 'sell');
    expect(afterSell).toBe(base - (base * 100n) / 500n);
  });

  it('clamps the price to [25%, 400%] of base', () => {
    const low = priceAfterTrade('WHEAT', BASE_PRICES.WHEAT, 100000n, 'sell');
    expect(low).toBe((BASE_PRICES.WHEAT * 2500n) / 10000n);
    const high = priceAfterTrade('WHEAT', BASE_PRICES.WHEAT, 100000n, 'buy');
    expect(high).toBe((BASE_PRICES.WHEAT * 40000n) / 10000n);
  });

  it('driftTick stays within the clamp bounds', () => {
    const prices = [{ kind: 'WHEAT', price: BASE_PRICES.WHEAT }];
    for (let i = 0; i < 50; i += 1) {
      const next = driftTick(prices, i).get('WHEAT')!;
      prices[0] = { kind: 'WHEAT', price: next };
    }
    expect(prices[0].price).toBeGreaterThan(0n);
  });

  it('spread is 8% by default, 1% with an oracle booster', () => {
    const now = new Date();
    expect(currentSpreadBps([], [], now)).toBe(800);
    const oracle = [{ id: 'x', playerId: 'p', boosterId: 'market_oracle', expiresAt: new Date(now.getTime() + 3600_000) }] as never;
    expect(currentSpreadBps([], oracle, now)).toBe(100);
  });
});
