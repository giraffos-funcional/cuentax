# CUENTAX BFF — Dockerfile Producción
# Multi-stage build: build → runtime mínimo

# ── Stage 1: Builder ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifiestos primero (cache layer)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/bff/package.json ./apps/bff/

RUN npm install -g pnpm && pnpm install --frozen-lockfile --filter @cuentax/bff

COPY apps/bff ./apps/bff

RUN cd apps/bff && pnpm build

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Solo producción deps
COPY --from=builder /app/apps/bff/package.json ./
COPY --from=builder /app/apps/bff/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Health check interno
HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

USER node

CMD ["node", "dist/server.js"]
