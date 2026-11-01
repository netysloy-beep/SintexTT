import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.logLevel,
  base: { svc: 'econ-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
