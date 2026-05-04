# CUENTAX — Plan Multi-Tenant + Admin + Suscripciones

> Plan v1 para llevar Cuentax de **multi-empresa** (un solo deploy, `company_id` en todas las tablas) a **multi-tenant SaaS** con subdominios por cliente, panel administrativo y modelo de cobro mixto (suscripción + revenue-share sobre honorarios).

**Estado:** borrador para discusión. Las secciones marcadas con ⚠️ son decisiones que requieren tu input antes de codear.

---

## 1. Lectura del problema

Hoy Cuentax es un solo deploy donde todos los usuarios entran por `cuentax.cl` y trabajan sobre `companies` (con `company_id` en cada tabla de negocio). Lo que necesitas es:

- **Aislamiento por cliente** vía subdominio (`cliente1.cuentax.cl`, `cliente2.cuentax.cl`, …) — UX de "tu propia instancia".
- **Panel admin** (`admin.cuentax.cl`) para crear / suspender / facturar / monitorear cada subdominio.
- **Suscripciones** con cobro recurrente automatizado en CLP.
- **Revenue-share**: 20% de los honorarios de contabilidad + 20% de los honorarios de remuneraciones que el contador cobra a sus PYMEs, facturado a través de Cuentax.

Ese modelo encaja con: **el tenant = el contador/despacho**, y dentro de cada tenant hay N `companies` (las PYMEs de sus clientes). Si esto NO es así (p.ej. el tenant es directamente la PYME), todo el plan cambia — confirmar antes de avanzar. ⚠️

---

## 2. Decisiones arquitectónicas clave (a confirmar)

| # | Decisión | Recomendación | Alternativas |
|---|---|---|---|
| D1 | Modelo de tenancy | **Shared DB + `tenant_id`** (extender el patrón actual de `company_id`). Misma instancia de Postgres, fila etiquetada por tenant, todas las queries filtradas por middleware. | Schema-per-tenant (más aislado, más caro de operar) · DB-per-tenant (enterprise tier, futuro) |
| D2 | Routing de subdominio | **Wildcard DNS** `*.cuentax.cl` → mismo IP. Nginx pasa el `Host` al BFF, middleware resuelve `tenant_id` desde el subdominio. | Crear DNS por cliente (vía API Cloudflare) — más complejidad, sin beneficio real |
| D3 | SSL | **Wildcard cert** Let's Encrypt vía DNS-01 challenge (Cloudflare API). Un solo cert sirve a todos los subdominios. | Cert por subdominio — frágil, lento al onboarding |
| D4 | Quién es el tenant | **El contador / despacho** (mantiene N empresas dentro). | El PYME directo (no encaja con el modelo de honorarios) |
| D5 | Pasarela de pago | **Flow.cl** o **Webpay Plus + Oneclick** para suscripción CLP. | Stripe (con adquirente CL) · Mercado Pago · Khipu |
| D6 | Hosting | Mantener **Coolify/VPS** + Postgres + Redis actuales. Agregar admin app y servicios de billing. | Migrar a k8s — sobre-ingeniería para esta etapa |
| D7 | Aislamiento de datos en runtime | **Row-Level Security (RLS) en Postgres** + middleware setea `app.current_tenant`. Defensa en profundidad. | Solo middleware (más rápido pero un bug = leak) |
| D8 | White-label por tenant | Soportar logo + colores por tenant en MVP. **Dominio propio** (`contabilidad-perez.cl` apuntando a Cuentax) en fase 2. | Ninguno (todos usan `*.cuentax.cl`) |

**Recomendación global:** D1 + D2 + D3 + RLS (D7). Es la opción de menor costo operativo, más rápida de shippear, y deja la puerta abierta a un *enterprise tier* con DB dedicada en el futuro sin rehacer nada.

---

## 3. Modelo de datos nuevo

Tablas nuevas a agregar en `apps/bff/src/db/schema/`:

### `tenants` (raíz)
```
id, slug (subdomain), name, status (active|suspended|trialing|cancelled),
plan_id, owner_user_id, primary_rut, billing_email, branding (jsonb: logo_url, primary_color),
trial_ends_at, created_at, updated_at, deleted_at
```

### `plans`
```
id, code (starter|pro|enterprise|custom), name,
base_price_clp, included_dtes, included_companies,
overage_price_per_dte_clp, features (jsonb),
revenue_share_enabled (bool), revenue_share_rate_contabilidad (default 0.20),
revenue_share_rate_remuneraciones (default 0.20)
```

### `subscriptions`
```
id, tenant_id, plan_id, status (active|past_due|cancelled|trialing),
current_period_start, current_period_end, cancel_at_period_end,
payment_provider (flow|webpay), payment_method_token, created_at
```

### `invoices` (Cuentax → tenant)
```
id, tenant_id, period (YYYY-MM), subtotal_clp, iva_clp, total_clp,
status (draft|issued|paid|overdue|void),
issued_at, due_at, paid_at, line_items (jsonb)
```

### `invoice_line_items`
```
id, invoice_id, type (subscription|overage|revenue_share_contabilidad|revenue_share_remuneraciones|adjustment),
description, qty, unit_price_clp, total_clp, metadata (jsonb)
```

### `payments`
```
id, invoice_id, provider, provider_txn_id, amount_clp, status, raw (jsonb), paid_at
```

### `tenant_fees` (lo que el contador cobra a SUS PYMEs)
```
id, tenant_id, company_id, fee_type (contabilidad|remuneraciones),
monthly_clp, billing_day, active, valid_from, valid_to, notes
```

### `revenue_share_runs` (cierre mensual)
```
id, tenant_id, period, status (calculating|ready|invoiced|paid),
total_contabilidad_clp, total_remuneraciones_clp,
share_contabilidad_clp, share_remuneraciones_clp,
total_share_clp, calculated_at, locked_at
```

### `audit_log` (extendido)
Agregar `tenant_id`, `actor_type` (admin|tenant_user|system).

### Cambios en tablas existentes
Agregar `tenant_id` a:
- `companies` (cada empresa pertenece a un tenant)
- `users` (un user existe en un tenant; mismo email puede repetirse entre tenants)
- Cualquier otra tabla "raíz" no scopeada hoy
- **Compatibilidad:** las tablas con `company_id` siguen funcionando — el `tenant_id` se deriva vía join con `companies` y se usa para RLS.

### Row-Level Security
Crear policy en cada tabla:
```sql
CREATE POLICY tenant_isolation ON companies
  USING (tenant_id = current_setting('app.current_tenant')::int);
```
Middleware del BFF hace `SET LOCAL app.current_tenant = $1` al inicio de cada request.

---

## 4. Resolución de tenant en el request

Pipeline propuesto:

```
DNS wildcard *.cuentax.cl → Nginx → BFF middleware → tenant context
```

1. Nginx pasa `Host: cliente1.cuentax.cl` al BFF.
2. Middleware nuevo en `apps/bff/src/middlewares/tenant.ts`:
   - Extrae el subdomain del `Host`.
   - Reservados: `www`, `api`, `admin`, `app`, `status` → no son tenants.
   - Lookup en cache (Redis, TTL 60s) → `tenants.slug` → `tenant_id`.
   - Inyecta `request.tenant = { id, slug, plan, status }`.
   - Si `status='suspended'` o `status='cancelled'` → redirect a página de pago.
3. Auth middleware lee tenant de `request.tenant`, valida que el usuario pertenezca a ese tenant.
4. Repositorios ejecutan `SET LOCAL app.current_tenant = X` antes de la query.

Frontend `apps/web` no cambia mucho — solo necesita saber que el endpoint del BFF ahora es `https://api.cuentax.cl` (o `https://${slug}.cuentax.cl/api/v1`, ver D9 abajo). ⚠️ **D9: ¿API por subdominio del tenant o un solo `api.cuentax.cl`?** Recomiendo un solo `api.cuentax.cl` y mandar el tenant en el `Origin/Host` (ya viene del navegador) o en un header `X-Tenant-Slug`.

---

## 5. Nuevas piezas en el monorepo

```
apps/
  admin/            ← Next.js, admin.cuentax.cl (NUEVO)
  bff/              ← + middleware tenant, + módulos billing/revenue-share
  web/              ← + branding por tenant, + flujo onboarding público
  sii-bridge/       ← sin cambios (ya es stateless)
packages/
  tenancy/          ← (NUEVO) tipos, resolver, helpers RLS
  billing/          ← (NUEVO) cálculo de invoices, integración Flow/Webpay
```

### `apps/admin` (admin.cuentax.cl)
Acceso solo para staff de Cuentax (super-admin). Funciones:
- Lista de tenants + filtros (estado, plan, MRR, último login).
- Vista detalle: uso (DTEs, empresas, usuarios), suscripción, facturas, pagos, deuda.
- Crear tenant (alta manual antes del self-serve).
- Suspender / reactivar / cancelar.
- Cambiar plan / aplicar crédito / generar factura manual.
- Dashboard global: MRR, ARR, churn, DTEs/mes, revenue-share del mes.
- **Impersonate** (audit-logged) — entrar al tenant como soporte.
- Gestión de planes, precios, descuentos.

### Módulo `billing` en BFF
- Cron diario: detecta períodos que vencen, genera invoice draft.
- Integración Flow/Webpay: cobro automático del invoice.
- Webhooks de pago → marca `payments` y reactiva suspendidos.
- Reintentos (dunning): 3, 7, 14 días → suspender al día 21.
- Emisión de DTE (factura electrónica de Cuentax al tenant) para el cobro.

### Módulo `revenue-share` en BFF
- Cierre mensual el día 1 a las 04:00:
  1. Para cada tenant activo, recorre `tenant_fees` activos del período.
  2. Suma honorarios de contabilidad y remuneraciones del mes.
  3. Calcula 20% + 20%.
  4. Crea `revenue_share_runs` con status `ready`.
  5. Inyecta line items en el invoice del tenant.
- ⚠️ **D10: ¿De dónde sale la "data verdadera" de los honorarios?**
  - Opción A: el contador DEFINE en Cuentax el monto fijo mensual por PYME (lo más simple). Cuentax cobra 20% de eso, pase lo que pase.
  - Opción B: Cuentax detecta que el contador emitió DTE 33/34 a la PYME por concepto contabilidad/remuneraciones (matching por glosa o categoría).
  - Opción C: Híbrido — fee fijo declarado + override por DTE emitido.
  - **Recomiendo A para MVP** (predecible, sin disputas). B es una optimización futura.

---

## 6. Flujo de onboarding self-serve (fase 2)

```
1. cuentax.cl/registrarse → form (RUT, nombre, email, subdominio deseado)
2. Validación slug (regex + reservados + duplicados)
3. Crear tenant (status=trialing, trial=14d) + admin user + seed básico
4. Email de verificación (link con token)
5. Verifica email → redirige a https://{slug}.cuentax.cl/onboarding
6. Wizard interno:
   - Subir cert SII .pfx (ya soportado en el flujo actual)
   - Crear primera empresa (PYME cliente)
   - Cargar CAF
   - Tour del producto
7. Día 12 del trial → email "agrega tarjeta para no perder el servicio"
8. Día 14 → si no hay método de pago → suspendido, datos preservados 30d
```

---

## 7. DNS, SSL e Infra

- **DNS**: agregar registro `*.cuentax.cl A <IP_LB>` (Cloudflare recomendado).
- **SSL**: certbot con DNS-01 challenge contra Cloudflare API → wildcard cert renovado cada 60d. Job en cron del host. Volume `nginx_certs` ya existe.
- **Nginx**: cambiar `server_name cuentax.cl www.cuentax.cl` por bloque adicional `server_name *.cuentax.cl;` que matchee subdominios y forwardee al `web:3000` con header `Host` preservado.
- **Reservados** (no asignables a tenants): `www`, `api`, `admin`, `app`, `status`, `docs`, `blog`, `mail`, `erp`, `staging`, `dev`.
- **Per-tenant rate limiting**: Nginx limit_req zone por subdomain key.

---

## 8. Modelo de cobro — números a definir ⚠️

Sugerencia inicial (a calibrar con tus costos reales):

| Plan | Precio base mensual (CLP, neto) | DTEs incluidos | Empresas incluidas | Revenue-share | Target |
|---|---|---|---|---|---|
| Starter | $19.900 | 100 | 3 | 20% / 20% | Contador independiente |
| Pro | $49.900 | 500 | 15 | 20% / 20% | Despacho pequeño |
| Business | $99.900 | 2.000 | 50 | 20% / 20% (configurable) | Despacho mediano |
| Enterprise | a medida | ilimitado | ilimitado | negociable | Despacho grande / red |

Adicionales:
- Overage: $40 por DTE sobre el incluido.
- Revenue-share **on top** del precio base — es el principal driver de revenue.
- Trial 14 días sin tarjeta.
- IVA 19% se agrega al cobro (Cuentax emite factura 33 al tenant).

⚠️ Confirmar: ¿el revenue-share aplica a TODOS los planes o solo desde Pro? ¿Hay un opt-out (precio más alto sin share)?

---

## 9. Seguridad y compliance

- **RLS Postgres** como segunda capa (defensa en profundidad).
- **JWT con `tenant_id` claim** — no se puede saltar de tenant aunque tengas token.
- **Audit log** extendido: cada acción registra `tenant_id`, `user_id`, `actor_type`, `ip`, `ua`.
- **Impersonation desde admin**: registrada como `actor_type=admin_impersonating`, con razón obligatoria.
- **Backups por tenant**: pg_dump filtrado por `tenant_id` para export bajo demanda (Ley 21.719 / portabilidad).
- **Borrado**: soft-delete con período de gracia 30d → hard delete + tombstone en audit log.
- **Cert SII por tenant**: ya está aislado por `company_id`, hay que verificar que también lo esté por `tenant_id` (no se compartan certs entre tenants).
- **Secretos por tenant** (API keys, webhook secrets): cifrados con KMS o `pgcrypto`, key derivada de tenant.

---

## 10. Migración de los datos actuales

Asumiendo que hoy tienes `companies` con varios `company_id` activos:

1. Crear `tenants` table.
2. Insertar 1 tenant "legacy" con slug `app` (o el que sea).
3. Backfill: `UPDATE companies SET tenant_id = 1`.
4. Agregar `NOT NULL` constraint a `tenant_id`.
5. Habilitar RLS gradualmente (primero modo `permissive`, después estricto).
6. Si hay despachos que hoy comparten un solo `companies.id` siendo en realidad clientes distintos, se separan post-migración.

Riesgo bajo porque mantenemos compatibilidad — el patrón actual sigue funcionando.

---

## 11. Roadmap por fases

### Fase 0 — Foundation (2 sem)
- [ ] Schema `tenants`, `plans`, migración legacy
- [ ] Middleware tenant resolver en BFF
- [ ] Nginx wildcard + SSL wildcard
- [ ] RLS en Postgres con feature-flag
- [ ] Tests E2E con dos tenants en paralelo
- [ ] CI: matrix de tests con tenancy on/off

### Fase 1 — Admin Console + Provisioning manual (3 sem)
- [ ] `apps/admin` con auth de super-admin
- [ ] CRUD de tenants
- [ ] Asignación de plan, suspensión, impersonate
- [ ] Dashboards: MRR, tenants activos, uso
- [ ] Branding por tenant (logo + colores)

### Fase 2 — Suscripciones + cobro automático (3 sem)
- [ ] Schema `subscriptions`, `invoices`, `payments`
- [ ] Integración Flow.cl o Webpay (suscripción + Oneclick)
- [ ] Cron de generación de invoices
- [ ] Dunning (reintentos + suspensión)
- [ ] Cuentax emite DTE 33 al tenant
- [ ] Customer portal: ver facturas, cambiar plan, actualizar tarjeta

### Fase 3 — Revenue-share (3 sem)
- [ ] Módulo `tenant_fees` (UI para que el contador defina honorarios por PYME)
- [ ] Cron de cierre mensual
- [ ] Inyección de line items en invoices
- [ ] Reportes para el contador (cuánto va a pagar de share)
- [ ] Override por evento (ajustes manuales con audit)

### Fase 4 — Self-serve onboarding (2 sem)
- [ ] Landing + signup público en `cuentax.cl`
- [ ] Validación + provisioning automático
- [ ] Email de bienvenida + verificación
- [ ] Wizard de onboarding dentro del tenant
- [ ] Trial → conversión a paid

### Fase 5 — Pulido y enterprise (continuo)
- [ ] Dominio propio del tenant (`contabilidad-perez.cl`)
- [ ] White-label completo (emails con SMTP del tenant)
- [ ] Tier "DB dedicada" para enterprise
- [ ] SLA, status page por tenant
- [ ] Programa de referidos

**Total estimado a Fase 4 inclusive:** ~13 semanas calendario para 1 dev senior fullstack, con QA básico. Puede comprimirse con 2 devs.

---

## 12. Riesgos y open questions

1. ⚠️ ¿El tenant es el contador o la PYME directa? (D4)
2. ⚠️ ¿De dónde sale la "verdad" de los honorarios para el revenue-share? (D10 — recomiendo A: declarado por el contador)
3. ⚠️ Pasarela de pago: Flow vs Webpay vs Stripe (D5).
4. ⚠️ ¿El revenue-share es obligatorio en todos los planes o opt-in con precio base mayor?
5. ¿Cuántos tenants/empresas/DTEs proyectados a 12 meses? Define el sizing de Postgres y si tiene sentido pensar en read replicas.
6. ¿Quieres que los contadores puedan revender Cuentax a SUS clientes (tenant-anidado / partner program)? Si sí, hay que pensar el modelo financiero distinto.
7. ¿Migración de tenants existentes pagando hoy fuera de plataforma? Cómo trasladar.
8. Cumplimiento SII: ¿Cuentax emite las facturas DTE de la suscripción + revenue-share al tenant? Confirmar tratamiento tributario del 20%.
9. Política de retención de datos al cancelar (30/60/90d).
10. SLAs comprometidos por plan y plan de respaldo si cae el deploy compartido.

---

## 13. Próximos pasos sugeridos

1. **Tú revisas este doc** y respondes los ⚠️ (sobre todo D1, D4, D5, D10).
2. **Yo armo un ADR** (`docs/adr/0001-multi-tenancy.md`) con la decisión final.
3. Sacamos un **spike de 3-5 días** que implemente el middleware tenant + RLS sobre el schema actual con un seed de 2 tenants, para validar que el modelo no tiene fugas.
4. Si el spike está limpio, arrancamos Fase 0.

---

*Última actualización:* 2026-05-04
