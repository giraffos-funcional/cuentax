# CUENTAX BFF — Dockerfile Produccion
# Uses official Playwright image (has Chromium + all system deps pre-installed)

FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace manifests first (Docker cache layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json ./apps/bff/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @cuentax/bff

# Copy source and build
COPY apps/bff ./apps/bff
RUN cd apps/bff && pnpm build

ENV NODE_ENV=production
ENV PORT=4000
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

EXPOSE 4000

# Health check
HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

WORKDIR /app/apps/bff
CMD ["node", "dist/server.js"]
