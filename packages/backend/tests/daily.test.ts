import { describe, expect, it } from 'vitest';
import { computeDaily } from '../src/economy/daily.js';

describe('daily bonus', () => {
  it('is claimable when never claimed', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const res = computeDaily({ lastDailyAt: null, streak: 0 }, now);
    expect(res.alreadyClaimed).toBe(false);
    expect(res.reward).toBe(5000n);
    expect(res.streak).toBe(1);
  });

  it('is blocked on the same UTC day (idempotent)', () => {
    const now = new Date('2026-01-15T23:30:00Z');
    const res = computeDaily({ lastDailyAt: new Date('2026-01-15T00:30:00Z'), streak: 3 }, now);
    expect(res.alreadyClaimed).toBe(true);
    expect(res.reward).toBe(0n);
  });

  it('streak grows on consecutive days and caps the reward', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const yesterday = new Date('2026-01-14T12:00:00Z');
    const res = computeDaily({ lastDailyAt: yesterday, streak: 5 }, now);
    expect(res.streak).toBe(6);
    expect(res.reward).toBe(5000n + 2500n * 5n);
    const res2 = computeDaily({ lastDailyAt: yesterday, streak: 20 }, now);
    expect(res2.reward).toBe(30000n);
  });

  it('resets the streak after a missed day', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const threeDaysAgo = new Date('2026-01-12T12:00:00Z');
    const res = computeDaily({ lastDailyAt: threeDaysAgo, streak: 9 }, now);
    expect(res.streak).toBe(1);
  });
});
