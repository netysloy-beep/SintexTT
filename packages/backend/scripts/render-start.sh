#!/bin/sh
# Render free-plan start: in-container Redis, migrations, seed, then the
# combined runtime (API server + BullMQ workers + Telegram bot).
set -e

redis-server --daemonize yes --maxmemory-policy noeviction

npx prisma migrate deploy
npx prisma db seed

exec node dist/all.js
