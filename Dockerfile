# ---------------------------------------------------------------------------
# Imagen única del monorepo hotelMCP.
#
# El componente se selecciona con --build-arg APP=<web|worker|mcp|monitor>.
# Las variables NEXT_PUBLIC_* se inyectan en tiempo de build porque Next las
# incrusta en el bundle del cliente.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim

RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# 1) Metadatos del workspace + dependencias (capa cacheable)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/mcp/package.json apps/mcp/
COPY apps/monitor/package.json apps/monitor/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/shared/package.json packages/shared/
# El lockfile se sincronizó con pnpm 10.32.1 (incremento v2), así que la imagen ya
# puede instalar en modo congelado; así un `package.json` sin lockfile rompe el build
# en lugar de resolver versiones nuevas en silencio.
RUN pnpm install --frozen-lockfile

# 2) Código fuente (lo excluido está en .gcloudignore / .dockerignore)
COPY . .

# 3) Variables públicas de la web (inyectadas por Next en build)
ARG APP
ARG NEXT_PUBLIC_RPC_URL=""
ARG NEXT_PUBLIC_CHAIN_ID=""
ARG NEXT_PUBLIC_CONTRACT_ADDRESS=""
ARG NEXT_PUBLIC_DEPLOYMENT_BLOCK="0"
ARG NEXT_PUBLIC_FAUCET_ADDRESS=""
ARG NEXT_PUBLIC_NETWORK=""
# URL pública del sitio: la usan la metadata Open Graph/Twitter y los enlaces absolutos.
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_CONTRACT_ADDRESS=$NEXT_PUBLIC_CONTRACT_ADDRESS \
    NEXT_PUBLIC_DEPLOYMENT_BLOCK=$NEXT_PUBLIC_DEPLOYMENT_BLOCK \
    NEXT_PUBLIC_FAUCET_ADDRESS=$NEXT_PUBLIC_FAUCET_ADDRESS \
    NEXT_PUBLIC_NETWORK=$NEXT_PUBLIC_NETWORK \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# 4) Compilación de shared y del componente elegido
#
# Los placeholders de entorno valen SOLO para este RUN: Next recolecta datos de
# las rutas y varios módulos de servidor leen secretos obligatorios al cargarse.
# No son NEXT_PUBLIC_*, así que no se incrustan en el bundle: en runtime Cloud
# Run inyecta los valores reales desde Secret Manager. Nunca se persisten con ENV.
RUN export DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    REDIS_URL="redis://127.0.0.1:6379" \
    SESSION_SECRET="build-only" \
    JWT_SECRET="build-only" \
    TICKET_SIGNING_SECRET="build-only" \
    CHECKIN_SECRET_KEY="0000000000000000000000000000000000000000000000000000000000000000" \
    AES_SECRET_KEY="0000000000000000000000000000000000000000000000000000000000000000" \
    VAPID_PUBLIC_KEY="build-only" \
    VAPID_PRIVATE_KEY="build-only" \
    VAPID_SUBJECT="mailto:build@example.com" \
    CONTRACT_ADDRESS="0x0000000000000000000000000000000000000000" \
 && pnpm --filter @hotel/shared build \
 && pnpm --filter @hotel/${APP} build

ENV NODE_ENV=production
ENV APP=${APP}
CMD ["sh", "-c", "pnpm --filter @hotel/${APP} start"]
