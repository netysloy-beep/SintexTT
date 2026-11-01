FROM node:22-alpine AS base
RUN corepack enable
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
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma
WORKDIR /app/packages/backend
CMD ["node", "dist/server.js"]
