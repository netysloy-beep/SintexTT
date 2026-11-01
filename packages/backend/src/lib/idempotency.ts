import { prisma } from './prisma.js';

/**
 * Idempotency for mutating requests: caller supplies a unique key
 * (playerId + Idempotency-Key header). First request executes the handler and
 * stores the response; repeated requests replay the stored response.
 */
export async function withIdempotency<T>(
  key: string,
  handler: () => Promise<{ statusCode: number; body: T }>,
): Promise<{ replayed: boolean; statusCode: number; body: T }> {
  const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });
  if (existing) {
    return {
      replayed: true,
      statusCode: existing.statusCode,
      body: JSON.parse(existing.responseBody) as T,
    };
  }
  const result = await handler();
  try {
    await prisma.idempotencyRecord.create({
      data: {
        key,
        statusCode: result.statusCode,
        responseBody: JSON.stringify(result.body),
      },
    });
  } catch {
    // Unique violation: a concurrent identical request already recorded it — replay.
    const concurrent = await prisma.idempotencyRecord.findUnique({ where: { key } });
    if (concurrent) {
      return {
        replayed: true,
        statusCode: concurrent.statusCode,
        body: JSON.parse(concurrent.responseBody) as T,
      };
    }
    throw new Error('IDEMPOTENCY_WRITE_FAILED');
  }
  return { replayed: false, statusCode: result.statusCode, body: result.body };
}

/** Housekeeping: drop records older than 30 days. */
export async function pruneIdempotency(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const res = await prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return res.count;
}
