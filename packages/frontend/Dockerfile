FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY packages/frontend/package.json packages/frontend/
RUN pnpm install --filter @econ/frontend --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/frontend packages/frontend
RUN cd packages/frontend && pnpm build

FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
ENV BACKEND_HOST=backend BACKEND_PORT=3000
EXPOSE 80
CMD ["sh", "-c", "envsubst '$BACKEND_HOST $BACKEND_PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
