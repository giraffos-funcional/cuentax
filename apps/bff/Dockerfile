# CUENTAX BFF — Dockerfile Produccion
# Multi-stage build: build -> runtime with Playwright/Chromium support

# ── Stage 1: Builder ──────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copiar manifiestos primero (cache layer)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY apps/bff/package.json ./apps/bff/

RUN npm install -g pnpm && pnpm install --frozen-lockfile --filter @cuentax/bff

COPY apps/bff ./apps/bff

RUN cd apps/bff && pnpm build

# ── Stage 2: Runtime (Debian-based for Playwright) ───────────
FROM node:20-slim AS runtime

WORKDIR /app

# Install Chromium system dependencies needed by Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy production deps + built code
COPY --from=builder /app/apps/bff/package.json ./
COPY --from=builder /app/apps/bff/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Install Playwright Chromium browser (headless only)
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers
RUN npx playwright install chromium

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Health check interno
HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
