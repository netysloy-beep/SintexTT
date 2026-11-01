import { describe, expect, it } from 'vitest';
import { acceptContract, deliverContract } from '../src/economy/contracts.js';
import type { Contract, Player } from '@prisma/client';

const PLAYER: Player = {
  id: 'p1', telegramId: 1n, username: null, firstName: null, money: 100000n,
  workers: 4, trucks: 1, streak: 0, lastDailyAt: null, referredBy: null,
  suspicion: 0, guildId: null, createdAt: new Date(), updatedAt: new Date(),
};

function contract(over: Partial<Contract>): Contract {
  return {
    id: 'c1', playerId: 'p1', resource: 'WHEAT', qty: 10n, reward: 1000n,
    penalty: 400n, status: 'OFFERED', deadline: new Date(Date.now() + 3600_000),
    truckLocked: false, deliveredQty: 0n, createdAt: new Date(),
    ...over,
  } as Contract;
}

const tx = {
  contract: {
    update: async () => ({}),
  },
} as never;

describe('contracts', () => {
  it('accepts an offered contract with a free truck', async () => {
    const c = contract({});
    await expect(acceptContract(tx, PLAYER, c, 0, 1, new Date())).resolves.toBeUndefined();
  });

  it('rejects acceptance without free trucks', async () => {
    const c = contract({});
    await expect(acceptContract(tx, PLAYER, c, 1, 1, new Date())).rejects.toThrow('NO_FREE_TRUCKS');
  });

  it('rejects already accepted or expired contracts', async () => {
    await expect(acceptContract(tx, PLAYER, contract({ status: 'ACTIVE' }), 0, 1, new Date())).rejects.toThrow('CONTRACT_NOT_OFFERED');
    await expect(
      acceptContract(tx, PLAYER, contract({ deadline: new Date(Date.now() - 1000) }), 0, 1, new Date()),
    ).rejects.toThrow('CONTRACT_EXPIRED');
  });

  it('delivery consumes stock and rejects insufficient stock', async () => {
    const res = new Map([['WHEAT', 15n]]);
    await deliverContract(tx, contract({ status: 'ACTIVE' }), res);
    expect(res.get('WHEAT')).toBe(5n);

    await expect(deliverContract(tx, contract({ status: 'ACTIVE', id: 'c2' }), new Map())).rejects.toThrow('INSUFFICIENT_STOCK');
  });
});
