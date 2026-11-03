import { PrismaClient, Prisma } from '@prisma/client';
import { env } from '../config/env.js';

export const prisma = new PrismaClient({
  log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
});

type TxCallback<A> = (tx: Prisma.TransactionClient) => Promise<A>;

const MAX_TX_ATTEMPTS = 3;

/**
 * The Supabase session pooler sometimes drops a pooled connection in the
 * middle of an interactive transaction, making Prisma fail with
 * "Transaction API error: Transaction not found" (P2028 family).
 * These are transient: retrying the whole transaction succeeds.
 */
function isTransientTxError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    /Transaction not found|Transaction API error|Timed out fetching/i.test(msg) ||
    /Connection terminated|Connection closed|Connection reset/i.test(msg) ||
    /Error querying the database/i.test(msg)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawTransaction = (prisma.$transaction as unknown as { bind: (self: unknown) => (arg: TxCallback<unknown>) => Promise<unknown> }).bind(prisma) as <A>(arg: TxCallback<A>) => Promise<A>;

(prisma as unknown as { $transaction: <A>(arg: TxCallback<A>) => Promise<A> }).$transaction = async <A>(
  arg: TxCallback<A>,
): Promise<A> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt += 1) {
    try {
      return await rawTransaction<A>(arg);
    } catch (err) {
      lastError = err;
      if (!isTransientTxError(err) || attempt === MAX_TX_ATTEMPTS) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw lastError;
};
