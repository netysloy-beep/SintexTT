FROM node:22-alpine AS base
# Prisma engine detection needs the openssl binary present (musl target).
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/backend/package.json packages/backend/
RUN pnpm install --filter @econ/backend --ignore-scripts

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/backend packages/backend
RUN cd packages/backend && pnpm prisma generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production
# redis-server runs in-container on free single-instance hosts (e.g. Render free plan)
RUN apk add --no-cache redis
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma
COPY --chmod=0755 packages/backend/scripts/render-start.sh /app/packages/backend/scripts/render-start.sh
WORKDIR /app/packages/backend
CMD ["node", "dist/server.js"]
