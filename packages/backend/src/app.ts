import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { registerAuthPlugin } from './api/auth-plugin.js';
import { registerRoutes } from './api/routes/index.js';
import { errorCodeToStatus } from './api/types.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    bodyLimit: 1 * 1024 * 1024,
    trustProxy: true,
  });

  // CORS: allow configured origins (Telegram WebApp + local dev).
  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
    methods: ['GET', 'POST'],
  });

  // Tolerate POSTs that carry Content-Type: application/json but an empty body
  // (e.g. older clients). Fastify would otherwise reject with FST_ERR_CTP_EMPTY_JSON_BODY.
  app.addHook('onRequest', async (req, _reply) => {
    const ct = req.headers['content-type'];
    if (ct !== undefined && ct.includes('application/json')) {
      const len = Number(req.headers['content-length'] ?? '0');
      if (!Number.isFinite(len) || len === 0) {
        req.headers['content-type'] = undefined;
        delete req.headers['content-type'];
      }
    }
  });

  await registerAuthPlugin(app);
  await registerRoutes(app);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      req.log.warn({ code: err.code }, err.message);
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err.validation) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: err.message });
    }
    const code = err instanceof Error && err.message && !err.message.includes(' ') ? err.message : 'INTERNAL_ERROR';
    const status = errorCodeToStatus(code);
    if (status >= 500) {
      req.log.error({ err }, 'unhandled error');
      // Surface the real reason to the client so issues are debuggable in the UI.
      const detail = err instanceof Error && err.message ? `${err.name}: ${err.message}` : 'Internal server error';
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: detail });
    }
    req.log.warn({ code }, 'economy error');
    return reply.status(status).send({ error: code, message: err.message });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
  });

  return app;
}
