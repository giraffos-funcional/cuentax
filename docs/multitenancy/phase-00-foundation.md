# Fase 00 — Foundation: tenants + middleware + RLS

## Objetivo
Convertir Cuentax de multi-empresa (`company_id`) a multi-tenant (`tenant_id`) con un solo deploy, subdominios servidos por un wildcard DNS+SSL y aislamiento defensivo vía Row-Level Security en Postgres. Al final de la fase, dos tenants seedados (`demo`, `acme`) deben poder convivir sin fugas.

## Prerrequisitos
- `docs/multitenancy/decisions.md` con D1, D4, D5, D10, D-Pricing, D-Hosting, D-DNS marcadas. (Resuelto: shared DB+RLS · contador como tenant · Mercado Pago · fees declarados · rate editable por tenant default 20/20 · Coolify · Cloudflare).
- Acceso a la cuenta de Cloudflare (o el provider DNS elegido) con permisos para crear API token.
- Acceso al servidor de prod (Coolify) para configurar el wildcard.

## Archivos a crear / modificar

### Nuevos
- `packages/tenancy/package.json`
- `packages/tenancy/src/index.ts` — exports públicos
- `packages/tenancy/src/resolver.ts` — `resolveTenantFromHost(host: string)`
- `packages/tenancy/src/reserved.ts` — lista de subdominios reservados
- `packages/tenancy/src/rls.ts` — helper `withTenantContext(db, tenantId, fn)`
- `apps/bff/src/db/schema/tenants.ts` — Drizzle schema para `tenants` y `plans`
- `apps/bff/src/middlewares/tenant.ts` — middleware Fastify
- `apps/bff/src/repositories/tenants.ts`
- `apps/bff/src/__tests__/tenant-isolation.test.ts` — E2E con dos tenants
- `apps/bff/scripts/seed-tenants.ts`
- `infra/postgres/rls-policies.sql` — policies RLS
- `infra/scripts/issue-wildcard-cert.sh` — certbot DNS-01

### Modificar
- `apps/bff/src/db/schema.ts` — agregar `tenant_id` a `companies`, `users`, `audit_log`. Re-exportar nuevas tablas.
- `apps/bff/src/db/client.ts` — set-local de `app.current_tenant` por request.
- `apps/bff/src/server.ts` — registrar middleware `tenant` antes de auth.
- `apps/bff/src/middlewares/auth.ts` — validar que `user.tenant_id === request.tenant.id`.
- `infra/nginx/nginx.prod.conf` — bloque `server_name *.cuentax.cl;`.
- `docker-compose.prod.yml` — env `TENANT_RESOLVER_CACHE_TTL=60`.
- `apps/bff/.env.example` y `.env.prod.example` — agregar `RESERVED_SUBDOMAINS`, `TENANT_DEFAULT_PLAN`.
- `pnpm-workspace.yaml` — incluir `packages/tenancy`.

## Schema Drizzle (referencia)

```ts
// apps/bff/src/db/schema/tenants.ts
export const tenantStatusEnum = pgEnum('tenant_status', [
  'trialing', 'active', 'past_due', 'suspended', 'cancelled'
])

export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 63 }).notNull().unique(),
  name: text('name').notNull(),
  status: tenantStatusEnum('status').notNull().default('trialing'),
  plan_id: integer('plan_id').references(() => plans.id),
  owner_user_id: integer('owner_user_id'),
  primary_rut: varchar('primary_rut', { length: 12 }),
  billing_email: varchar('billing_email', { length: 255 }),
  branding: jsonb('branding'),
  trial_ends_at: timestamp('trial_ends_at', { withTimezone: true }),
  // Revenue-share editable por tenant (default 20% / 20%, ver D-Pricing)
  revenue_share_rate_contabilidad: decimal('revenue_share_rate_contabilidad', { precision: 5, scale: 4 }).notNull().default('0.2000'),
  revenue_share_rate_remuneraciones: decimal('revenue_share_rate_remuneraciones', { precision: 5, scale: 4 }).notNull().default('0.2000'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  slugIdx: uniqueIndex('tenant_slug_idx').on(t.slug),
  statusIdx: index('tenant_status_idx').on(t.status),
}))

export const plans = pgTable('plans', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  name: text('name').notNull(),
  base_price_clp: integer('base_price_clp').notNull(),
  included_dtes: integer('included_dtes').notNull(),
  included_companies: integer('included_companies').notNull(),
  overage_price_per_dte_clp: integer('overage_price_per_dte_clp').notNull(),
  features: jsonb('features'),
  revenue_share_enabled: boolean('revenue_share_enabled').notNull().default(true),
  // Rates ahora viven en `tenants` (editable por tenant). El plan solo flaggea si aplica.
  active: boolean('active').notNull().default(true),
})
```

## Tareas

- [ ] T0.1 — Crear paquete `packages/tenancy` con `resolver`, `reserved`, `rls`. Tests unitarios para parsing de host (apex, subdominio, puerto, IPs, edge-cases).
- [ ] T0.2 — Crear migración Drizzle: tablas `plans`, `tenants`, agregar columna `tenant_id NULLABLE` a `companies`, `users`, `audit_log`.
- [ ] T0.3 — Backfill: insertar tenant `legacy` (slug=`app`), `UPDATE companies/users/audit_log SET tenant_id=1`. Luego `ALTER COLUMN tenant_id SET NOT NULL`.
- [ ] T0.4 — Seeds: insertar planes (`starter`, `pro`, `business`) y dos tenants demo (`demo`, `acme`) con un usuario admin cada uno.
- [ ] T0.5 — Middleware `tenant` en BFF: parsea `Host`, hace lookup con cache Redis (TTL 60s), inyecta `request.tenant`. 404 si tenant no existe; 402/redirect si suspendido. Skip para `api`, `admin`, `www` (la API se sirve por subdomain en Fase 1; en esta fase aceptar también `?tenant=slug` para tests).
- [ ] T0.6 — Hook en cada request del BFF: ejecuta `SET LOCAL app.current_tenant = $1` dentro de la transacción. Wrapper `withTenantContext(tenantId, fn)`.
- [ ] T0.7 — Habilitar RLS en Postgres con policies en `companies`, `users`, `dte`, `contacts`, `products`, `caf`, `cotizaciones`, `audit_log` y demás tablas con `company_id`. Modo `ENABLE ROW LEVEL SECURITY` + policy de SELECT/INSERT/UPDATE/DELETE basada en `current_setting('app.current_tenant')::int`.
  - Excepción: rol `cuentax_admin` BYPASS RLS para jobs de billing y migraciones.
- [ ] T0.8 — Test E2E (`tenant-isolation.test.ts`): seedea `demo` y `acme`, hace login con user de `demo`, intenta leer/escribir datos de `acme` por API directa y forzando `company_id`. Debe fallar siempre.
- [ ] T0.9 — Nginx: agregar bloque `server { server_name ~^(?<sub>[^.]+)\.cuentax\.cl$; }` que pasa header `X-Tenant-Slug $sub` al BFF. Mantener bloques actuales para `cuentax.cl` y `api.cuentax.cl`.
- [ ] T0.10 — Wildcard SSL: script `infra/scripts/issue-wildcard-cert.sh` que usa certbot con plugin DNS Cloudflare. Cron mensual para renovación. Documentar en `infra/docs/`.
- [ ] T0.11 — DNS: crear registro `*.cuentax.cl A <IP_LB>` (manual, documentar en `infra/docs/dns.md`).
- [ ] T0.12 — Validación local: levantar dev con dos hosts en `/etc/hosts` (`demo.cuentax.local`, `acme.cuentax.local`) → 3000 y 4000 deben responder según tenant.
- [ ] T0.13 — Documentar en `AGENTS.md` que cualquier nueva tabla con datos de negocio requiere `tenant_id` + RLS policy.

## Comandos

```bash
# Crear paquete y migración
pnpm --filter @cuentax/tenancy init
cd apps/bff && pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# Seed
pnpm --filter @cuentax/bff exec tsx scripts/seed-tenants.ts

# RLS policies
psql "$DATABASE_URL" -f infra/postgres/rls-policies.sql

# Tests
pnpm -w test --filter @cuentax/bff
pnpm -w typecheck

# Levantar local con dos tenants
sudo bash -c 'echo "127.0.0.1 demo.cuentax.local acme.cuentax.local api.cuentax.local" >> /etc/hosts'
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @cuentax/bff dev

# Validar isolation manualmente
curl -H "Host: demo.cuentax.local" http://localhost:4000/api/v1/health
curl -H "Host: acme.cuentax.local" http://localhost:4000/api/v1/health

# SSL wildcard (en servidor prod)
sudo bash infra/scripts/issue-wildcard-cert.sh cuentax.cl
```

## Criterios de aceptación

1. `pnpm -w test` y `pnpm -w typecheck` pasan.
2. `tenant-isolation.test.ts` pasa con dos tenants seedados.
3. Una query `SELECT * FROM dte` desde un user de `demo` retorna SOLO los DTEs de `demo`, aunque haya un bug en código (RLS lo ataja).
4. `curl https://demo.cuentax.cl/api/v1/health` y `curl https://acme.cuentax.cl/api/v1/health` responden 200 desde el deploy de prod, ambos con cert válido.
5. `audit_log` registra `tenant_id` en cada entrada nueva.
6. La migración legacy no rompe ningún test existente del BFF.

## Riesgos

- **Migración con downtime**: el `ALTER COLUMN tenant_id SET NOT NULL` requiere lock. Hacer en ventana de baja actividad o usar `ALTER … VALIDATE` en dos pasos.
- **RLS y connection pooling**: PgBouncer en modo transaction-pooling rompe `SET LOCAL`. Forzar session-pooling para conexiones del BFF o usar `SET app.current_tenant` por query con `pg.query`.
- **Tests preexistentes que asumen single-tenant**: pueden romperse cuando RLS esté activo. Wrappear cada test setup con `withTenantContext`.
- **Subdominios con guiones / mayúsculas**: validar slug `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`.
- **Cache stampede del tenant resolver**: usar `singleflight` en Redis o lock de 1s al primer miss.
