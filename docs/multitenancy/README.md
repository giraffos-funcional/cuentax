# Cuentax Multi-Tenant — Ejecución por CLI

Plan dividido en **tickets ejecutables**. Cada `phase-NN-*.md` es autocontenido y se puede ejecutar individualmente con un agente CLI.

## Cómo correr cada fase

Con Claude Code:
```bash
claude "Ejecuta el ticket en docs/multitenancy/phase-00-foundation.md.
Lee primero AGENTS.md y el plan en docs/plan-multitenancy.md.
Trabaja una tarea a la vez, corre tests entre cambios y haz commit por tarea.
No avances al siguiente ticket sin que yo lo apruebe."
```

Con cualquier otro agente (Cursor / Aider / etc.):
```bash
# Aider ejemplo
aider --message "$(cat docs/multitenancy/phase-00-foundation.md)" \
  apps/bff/src/db/schema.ts apps/bff/src/middlewares/

# Codex
cat docs/multitenancy/phase-00-foundation.md | codex exec
```

Con `make` (atajos definidos abajo):
```bash
make tenancy-phase PHASE=00
```

## Orden de ejecución

| # | Fase | Bloquea a | Estimado |
|---|---|---|---|
| 00 | [Foundation: tenants + middleware + RLS](./phase-00-foundation.md) | todas | 2 sem |
| 01 | [Admin Console (`apps/admin`)](./phase-01-admin.md) | 02 | 3 sem |
| 02 | [Suscripciones + cobro Flow/Webpay](./phase-02-billing.md) | 03 | 3 sem |
| 03 | [Revenue-share 20%/20%](./phase-03-revenue-share.md) | 04 | 3 sem |
| 04 | [Onboarding self-serve](./phase-04-self-serve.md) | — | 2 sem |
| 05 | [Pulido + enterprise](./phase-05-polish.md) | — | continuo |

**Antes de Fase 00**: lee y responde [decisions.md](./decisions.md). Hay 4 decisiones que cambian el plan si no quedan resueltas.

## Convenciones para el agente

- **Stack del repo**: pnpm workspaces · Turbo · Next.js 14 · Fastify · Drizzle · FastAPI · Postgres 16 · Redis 7 · Odoo 18.
- **Tests**: cada PR pasa `pnpm -w test` y `pnpm -w typecheck`.
- **Commits**: convencional (`feat(tenancy):`, `fix(billing):`, etc.). Un commit por tarea.
- **Branches**: `tenancy/phase-NN-slug-corto`.
- **Migraciones**: siempre via `drizzle-kit generate`, nunca SQL a mano excepto RLS policies.
- **No tocar** `apps/sii-bridge` salvo que el ticket lo pida explícitamente.
- **Definición de "hecho"**: criterios de aceptación cumplidos + tests verdes + revisado por humano.

## Estructura de cada ticket

Cada `phase-NN-*.md` tiene:
1. **Objetivo** — qué se logra
2. **Prerrequisitos** — qué tickets deben estar terminados
3. **Archivos a crear/modificar** — paths concretos
4. **Tareas** — checklist atómico
5. **Comandos** — los que hay que correr
6. **Criterios de aceptación** — cómo se valida
7. **Riesgos** — qué cuidar
