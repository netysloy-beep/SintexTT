import type { FastifyReply } from 'fastify';

/** Recursively convert BigInt values to strings so JSON.stringify works. */
export function bigintToJSON<T>(value: T): T {
  if (typeof value === 'bigint') return (value.toString() as unknown) as T;
  if (Array.isArray(value)) return (value.map((v) => bigintToJSON(v)) as unknown) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = bigintToJSON(v);
    }
    return out as T;
  }
  return value;
}

/** Send a JSON payload with BigInt-safe serialization and status code. */
export function sendJSON(reply: FastifyReply, statusCode: number, payload: unknown): FastifyReply {
  return reply.status(statusCode).send(bigintToJSON(payload));
}

/** Map thrown Error messages from the economy layer to HTTP status codes. */
export function errorCodeToStatus(code: string): number {
  switch (code) {
    case 'INVALID_QTY':
    case 'QTY_TOO_LARGE':
    case 'UNKNOWN_RESOURCE':
    case 'INVALID_AMOUNT':
    case 'UNKNOWN_RESPONSE':
    case 'UNKNOWN_EVENT':
      return 400;
    case 'INSUFFICIENT_FUNDS':
    case 'INSUFFICIENT_STOCK':
    case 'NO_FREE_TRUCKS':
    case 'ALREADY_CLAIMED_TODAY':
    case 'BID_TOO_LOW':
    case 'ALREADY_TOP_BIDDER':
      return 422;
    case 'PLAYER_NOT_FOUND':
    case 'BUILDING_NOT_FOUND':
    case 'CONTRACT_NOT_FOUND':
    case 'LOT_NOT_FOUND':
    case 'PRICE_NOT_FOUND':
      return 404;
    case 'EVENT_ALREADY_RESOLVED':
    case 'EVENT_ALREADY_ANSWERED':
    case 'EVENT_EXPIRED':
    case 'CONTRACT_NOT_OFFERED':
    case 'CONTRACT_NOT_ACTIVE':
    case 'CONTRACT_EXPIRED':
    case 'LOT_CLOSED':
    case 'LOT_NOT_IN_WINDOW':
    case 'TECH_LOCKED':
    case 'TECH_ALREADY_OWNED':
    case 'GUILD_NAME_TAKEN':
    case 'ALREADY_IN_GUILD':
      return 409;
    default:
      return 500;
  }
}
