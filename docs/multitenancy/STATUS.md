# Estado de ejecución — Plan multi-tenancy

> Snapshot al 2026-05-04. Actualizar al cerrar cada tarea/fase.

## Fase 00 — Foundation

| Task | Estado | Notas |
|------|--------|-------|
| T0.1 — `packages/tenancy` | ✅ done | 22 tests verdes; resolver, reserved, RLS helpers. |
| T0.2 — Migración Drizzle (tenants/plans + tenant_id) | ✅ code done | SQL en `0007_phase00_tenants.sql` + DDL inline en `server.ts` (idempotente). **Pending validación contra DB real**. |
| T0.3 — Backfill legacy | ✅ code done | `apps/bff/scripts/backfill-tenants.ts` listo. **Pending ejecutar contra DB**. |
| T0.4 — Seed planes + tenants demo | ✅ code done | `apps/bff/scripts/seed-tenants.ts`. **Pending ejecutar**. |
| T0.5 — Middleware host resolver | ✅ code done | `middlewares/tenant.ts` reescrito; cache Redis con negative-cache. **Pending validar con DB+Redis up**. |
| T0.6 — RLS hook por request | ✅ code done | `db/with-tenant.ts` (helper opt-in con `BEGIN; SET LOCAL …`). Adopción incremental. |
| T0.7 — RLS policies | ✅ code done | `infra/postgres/rls-policies.sql` cubre 22 tablas + role `cuentax_admin` BYPASSRLS. **Pending aplicar `psql -f`**. |
| T0.8 — Test E2E aislamiento | 🟡 partial | Unit tests OK; el integration test contra DB con dos tenants seedados queda esbozado en el archivo. |
| T0.9 — Nginx wildcard | ✅ code done | `infra/nginx/nginx.tenants.conf`. **Pending incluirlo en prod nginx + reload**. |
| T0.10 — Cert wildcard | ✅ code done | `infra/scripts/issue-wildcard-cert.sh`. **Pending Cloudflare API token + ejecutar en prod**. |
| T0.11 — DNS docs | ✅ done | `infra/docs/dns.md`. **Pending crear records en Cloudflare**. |
| T0.12 — Validación local 2 tenants | ⏸ blocked | Requiere Docker corriendo + `/etc/hosts`. |
| T0.13 — Convenciones nuevas tablas | ✅ done | `AGENTS.md` documenta `tenant_id` + `withTenantTx` + reserved subdomains. |

### Pendiente de operador para cerrar Fase 00

1. `docker compose -f docker-compose.dev.yml up -d`
2. `pnpm --filter @cuentax/bff exec tsx scripts/seed-tenants.ts`
3. `pnpm --filter @cuentax/bff exec tsx scripts/backfill-tenants.ts`
4. Validar con SQL que `companies.tenant_id` y `audit_log.tenant_id` están todos llenos.
5. `pnpm --filter @cuentax/bff exec tsx scripts/backfill-tenants.ts --enforce-not-null`
6. `psql "$DATABASE_URL" -f infra/postgres/rls-policies.sql`
7. (Prod) Crear API token Cloudflare según `infra/docs/dns.md`, crear registros DNS, correr `issue-wildcard-cert.sh`, incluir `nginx.tenants.conf` y reload.

## Fases 01–05 — Pendiente

No iniciadas. Cada una depende de Fase 00 validada en dev (idealmente también en staging) antes de empezar.

| Fase | Estado | Estimado |
|------|--------|----------|
| 01 — Admin Console | ⏸ pending | 3 sem |
| 02 — Billing (Mercado Pago) | ⏸ pending | 3 sem |
| 03 — Revenue-share | ⏸ pending | 3 sem |
| 04 — Onboarding self-serve | ⏸ pending | 2 sem |
| 05 — Polish | ⏸ continuo | — |

## Notas

- `apps/bff/src/db/migrations/meta/_journal.json` quedó alineado con los snapshots de drizzle-kit (0000, 0001). Migraciones 0003+ se aplican por el bloque inline DDL de `server.ts` (legacy) o `psql` directo. La migración multi-tenancy `0007_phase00_tenants.sql` está disponible para ambos paths.
- 87/87 tests del BFF en verde, typecheck limpio en todo el workspace.
