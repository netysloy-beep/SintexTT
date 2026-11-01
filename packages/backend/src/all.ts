/**
 * Combined runtime: API server + background workers + Telegram bot in one process.
 * Use on hosts where separate services are expensive (e.g. Render Starter plan).
 * On Docker Compose / Railway prefer the dedicated entries:
 * dist/server.js, dist/workers/index.js, dist/bot/index.js.
 */
import './workers/index.js';
import './bot/index.js';
import './server.js';
