# Fase 01 — Admin Console (`apps/admin`)

## Objetivo
Tener `admin.cuentax.cl` con panel de super-admin para crear/listar/suspender tenants, asignar planes, ver dashboards (MRR, churn, uso) e impersonar tenants para soporte. La provisioning sigue siendo manual desde el admin (self-serve va en Fase 04).

> El detalle de tenant debe incluir inputs editables para `revenue_share_rate_contabilidad` y `revenue_share_rate_remuneraciones` (rango 0.0000–1.0000, prellenado en 0.2000 desde phase-00). Los cambios se persisten directo en `tenants` y los aplica el cálculo del próximo cierre (phase-03).

## Prerrequisitos
- Fase 00 completada (tenants, RLS, middleware funcionando).

## Archivos a crear / modificar

### Nuevos
- `apps/admin/` — Next.js 14 App Router, mismo stack que `apps/web`.
  - `package.json`, `next.config.mjs`, `tailwind.config.ts`
  - `src/app/layout.tsx`, `src/app/login/page.tsx`
  - `src/app/(dashboard)/page.tsx` — overview MRR/ARR/tenants
  - `src/app/(dashboard)/tenants/page.tsx` — lista
  - `src/app/(dashboard)/tenants/[slug]/page.tsx` — detalle
  - `src/app/(dashboard)/tenants/new/page.tsx` — alta manual
  - `src/app/(dashboard)/plans/page.tsx`
  - `src/app/(dashboard)/audit/page.tsx`
- `apps/bff/src/routes/admin.ts` — endpoints `/api/admin/*` (auth de super-admin)
- `apps/bff/src/services/tenant-provisioning.ts`
- `apps/bff/src/services/impersonation.ts`
- `apps/bff/src/db/schema/super-admins.ts`
- `apps/admin/src/lib/api-client.ts`
- `apps/bff/src/__tests__/admin-routes.test.ts`

### Modificar
- `infra/nginx/nginx.prod.conf` — bloque `server { server_name admin.cuentax.cl; }` → `admin:3001`.
- `docker-compose.prod.yml` — agregar servicio `admin`.
- `pnpm-workspace.yaml` — incluir `apps/admin`.
- `turbo.json` — pipeline para admin.

## Tareas

- [ ] T1.1 — Scaffold `apps/admin` con Next.js 14 + Tailwind + SWR + shadcn-style. Reusar tokens de tema de `packages/theme` si existe, si no, crear simple.
- [ ] T1.2 — Tabla `super_admins` (separada de `users` de tenant) con email + password hash + role (`owner|support|finance`).
- [ ] T1.3 — Auth en `apps/admin`: login email + password + 2FA TOTP (mandatorio para super-admin). JWT con scope `admin`.
- [ ] T1.4 — Endpoints BFF `/api/admin/*` protegidos por middleware `requireSuperAdmin` (NO usa el middleware de tenant; estos endpoints son cross-tenant).
  - `POST /api/admin/tenants` — crear
  - `GET /api/admin/tenants` — listar con filtros + paginación
  - `GET /api/admin/tenants/:slug` — detalle (incluye uso del mes: DTEs, empresas, usuarios, MRR, deuda)
  - `PATCH /api/admin/tenants/:slug` — cambiar plan, status, branding
  - `POST /api/admin/tenants/:slug/suspend` y `/reactivate`
  - `POST /api/admin/tenants/:slug/impersonate` — devuelve un JWT de tenant con flag `impersonating_admin_id`
  - `GET /api/admin/metrics/overview` — MRR, ARR, tenants activos, churn 30d
  - `GET /api/admin/audit` — logs cross-tenant
- [ ] T1.5 — Servicio `tenant-provisioning.ts`:
  1. Validar slug único + reservados.
  2. Crear `tenant` (status=`trialing`, trial 14d).
  3. Crear `users` admin del tenant (email + password temporal).
  4. Insertar fila en `audit_log` (`actor_type=super_admin`).
  5. Enviar email "bienvenido a Cuentax" con magic link de primer login.
- [ ] T1.6 — Servicio `impersonation.ts`: emite JWT con claim `impersonating_admin_id`. Cada request hecho en modo impersonate registra el admin en `audit_log`. UI del tenant muestra banner rojo "Estás en modo soporte como X".
- [ ] T1.7 — UI overview: KPIs (MRR, ARR, tenants activos, % paid, churn), tabla de tenants con sparkline de DTEs.
- [ ] T1.8 — UI detalle de tenant: tabs (resumen / suscripción / facturas / uso / usuarios / audit). Botones: cambiar plan, suspender, impersonar, generar invoice manual (placeholder hasta Fase 02).
- [ ] T1.9 — UI gestión de planes: CRUD de `plans`. No permite borrar plan en uso.
- [ ] T1.10 — Tests:
  - Endpoint `POST /admin/tenants` crea tenant + admin + audit log.
  - Super-admin sin 2FA no puede acceder.
  - Impersonate genera JWT con claim correcto y queda registrado.
  - User de tenant no puede llamar endpoints de admin.
- [ ] T1.11 — Nginx + compose para `admin.cuentax.cl` (puerto interno 3001, no expuesto).
- [ ] T1.12 — Documentar en `apps/admin/README.md` cómo crear el primer super-admin (script CLI `pnpm --filter @cuentax/bff exec tsx scripts/create-super-admin.ts`).

## Comandos

```bash
# Scaffold
pnpm create next-app apps/admin --typescript --app --tailwind --eslint --import-alias "@/*" --use-pnpm

# Migraciones
cd apps/bff && pnpm drizzle-kit generate && pnpm drizzle-kit migrate

# Crear primer super-admin
pnpm --filter @cuentax/bff exec tsx scripts/create-super-admin.ts \
  --email francisco@giraffos.com --role owner

# Dev
pnpm --filter @cuentax/admin dev   # http://localhost:3001
pnpm --filter @cuentax/bff dev

# Tests
pnpm -w test --filter @cuentax/bff
pnpm -w typecheck
```

## Criterios de aceptación

1. `admin.cuentax.cl/login` exige 2FA TOTP.
2. Crear un tenant desde la UI deja un tenant nuevo en DB + admin user + email de bienvenida.
3. Impersonar tenant muestra banner rojo en `apps/web`, JWT contiene claim, audit log lo registra.
4. Suspender tenant → cualquier request al subdominio responde 402 con página "tu cuenta está suspendida".
5. KPIs del dashboard cuadran con queries directas a la DB (verificar manualmente con SQL).
6. Tests pasan.

## Riesgos

- **Privilege escalation**: middleware `requireSuperAdmin` mal puesto puede dejar endpoints abiertos. Test unitario que itere todas las rutas y compruebe el guard.
- **Impersonation sin audit**: forzar que el wrapper falle si no hay `tenant_id` y `actor_admin_id`.
- **2FA mal implementado**: usar librería probada (`otplib`) y semilla de 32 bytes.
- **Cross-tenant queries en BFF**: las rutas `/admin/*` BYPASS RLS — verificar que no se mezclen accidentalmente con rutas de tenant.
