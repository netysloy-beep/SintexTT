import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { registerAuthPlugin } from './api/auth-plugin.js';
import { registerRoutes } from './api/routes/index.js';
import { errorCodeToStatus } from './api/types.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as never,
    bodyLimit: 1 * 1024 * 1024,
    trustProxy: true,
  });

  // CORS: allow configured origins (Telegram WebApp + local dev).
  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
    methods: ['GET', 'POST'],
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
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
    req.log.warn({ code }, 'economy error');
    return reply.status(status).send({ error: code, message: err.message });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
  });

  return app;
}
