# --- Etapa de build ---------------------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV PNPM_HOME=/usr/local/bin
RUN corepack enable

# Dependencias primeiro, para aproveitar o cache de camadas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile

# Codigo-fonte e build do painel + servidor.
COPY . .
RUN pnpm --filter @whatsrouter/web build \
 && pnpm --filter @whatsrouter/server build \
 && pnpm prune --prod || true

# --- Etapa de execucao ------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    DATABASE_PATH=/app/data/whatsrouter.sqlite

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/api/healthz || exit 1

CMD ["node", "server/dist/index.js"]