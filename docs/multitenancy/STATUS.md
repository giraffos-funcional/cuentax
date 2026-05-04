# Estado de ejecución — Plan multi-tenancy

> Snapshot al 2026-05-04 17:00 (post 2FA + email + dunning + PDF).

## Resumen ejecutivo

| Fase | Estado | Notas |
|---|---|---|
| 00 — Foundation                                  | ✅ done en prod              | tenants/plans/RLS helpers/middleware/policies/certbot/nginx scripts. |
| 01 — Admin Console                               | ✅ 100% feature-complete     | 12 endpoints, UI completa, **2FA TOTP backend+UI activado**. Falta: deploy del admin app a Coolify. |
| 02 — Billing (Mercado Pago)                      | 🟢 95%                        | schema, MP provider, webhook HMAC, endpoints, invoice generator, **PDF export**, customer portal, **cron generate+charge-due+dunning** todos wired. **Sólo falta**: creds MP en Coolify para flujo real. |
| 03 — Revenue share                               | ✅ 100% backend + UI          | calculator/closer/injector, cron, admin UI runs+bulk close, UI honorarios contador. Validado E2E con números del plan ($68k share). |
| 04 — Self-serve onboarding                       | 🟢 95%                        | endpoint signup público + UI + **magic-link email + provider abstraction (Postmark/Resend/Log)**. Falta: provider real (POSTMARK_TOKEN). |
| 05 — Polish + enterprise                         | ⏸ no iniciada                |  |

## Endpoints en prod (cuentaxapi.giraffos.com)

### `/api/admin/*`
- `POST /auth/login` (con `totp_code` opcional)
- `POST /auth/totp/{enroll,verify,disable}`
- `GET  /me`
- Tenants: `GET/POST /tenants`, `GET/PATCH /tenants/:slug`, suspend/reactivate, revenue-share rates, impersonate
- `GET /plans`, `GET /metrics/overview`, `GET /audit`, `POST /admins`
- Billing: `GET /invoices`, `POST /billing/invoices/generate`
- Revenue share: `GET/POST /revenue-share/runs|close|lock|inject`

### `/api/v1/*`
- Billing tenant: `setup-intent`, `subscription`, `invoices`, `invoices/:id/pdf`
- `tenant-fees` CRUD + `/projection`
- Webhook MP: `/webhooks/mercadopago` (HMAC SHA-256)
- Signup público: `/signup`, `/signup/slug-available`, `/signup/magic-link/consume` (rate-limited)

## Apps

- **`apps/bff`** ✅ live (cuentaxapi.giraffos.com)
- **`apps/web`** ✅ live (cuentaxweb.giraffos.com) — pages añadidas: `/dashboard/honorarios`, `/dashboard/billing`, `/signup`
- **`apps/admin`** 📦 listo en repo, **falta crear app Coolify** — pages: login (con TOTP), dashboard, tenants list/detail/new, plans, billing, revenue-share, audit, security
- **`apps/sii-bridge`** ✅ live, intacto

## Crons BullMQ activos (todos schedules en UTC)

| Job | Schedule | Función |
|---|---|---|
| `dte-status-polling` | every 30 min | DTE status (existente) |
| `dte-mailbox-poller` | continuous | IMAP listener (existente) |
| `previred-scraper` | repeated | Previred (existente) |
| `rcv-sync` | repeated | RCV SII (existente) |
| **`close-revenue-share`** | `0 7 1 * *` | Cierre rev-share mensual (≈04:00 CLT día 1) |
| **`generate-monthly-invoices`** | `0 5 1 * *` | Invoice generation (≈02:00 CLT día 1) |
| **`charge-due-invoices`** | `0 12 * * *` | Cobro diario MP (≈09:00 CLT, requiere MP_ACCESS_TOKEN) |
| **`dunning`** | `0 13 * * *` | Dunning step machine (≈10:00 CLT) |

## Packages workspace

| Paquete | Uso |
|---|---|
| `@cuentax/types` | tipos compartidos (existente) |
| `@cuentax/api-client` | cliente HTTP (existente) |
| `@cuentax/stores` | Zustand stores (existente) |
| `@cuentax/theme` | tokens design (existente) |
| `@cuentax/tenancy` | host resolver, RLS helpers — **22 tests** |
| `@cuentax/billing` | MercadoPagoProvider — **6 tests** |
| `@cuentax/email` | Log/Postmark/Resend abstraction |

## Tests totales: 136 verdes

- `@cuentax/tenancy`: 22
- `@cuentax/billing`: 6
- `@cuentax/bff`: 108 (incluye 11 nuevos de TOTP RFC 6238 + 10 de revenue-share period helpers)

## Pendiente — todo lo que requiere acción del operador

### Bloqueantes para go-live de billing
- [ ] **MP credentials**: setear `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` en Coolify env del cuentax-bff
- [ ] **Email provider**: setear `EMAIL_PROVIDER=postmark` + `POSTMARK_TOKEN` (o Resend) — sin esto, magic-links de signup van al log

### Bloqueantes para go-live de admin console
- [ ] **Crear app Coolify** para `apps/admin` con dominio (sugerido `cuentaxadmin.giraffos.com` o `admin.cuentax.cl`). Env vars: `BFF_URL=https://cuentaxapi.giraffos.com`, `NODE_ENV=production`

### Bloqueantes para multi-tenant subdomain real
- [ ] **Server dedicado CCX13** Hetzner (ya recomendado)
- [ ] **DNS Cloudflare** wildcard `*.cuentax.cl` apuntando a LB
- [ ] **SSL wildcard** vía `infra/scripts/issue-wildcard-cert.sh`
- [ ] **Nginx**: incluir `infra/nginx/nginx.tenants.conf` en prod

### Nice-to-have
- [ ] PDF DTE 33 oficial (actualmente PDF interno; falta CAF + cert SII propio)
- [ ] UI override manual de runs revenue-share desde admin
- [ ] Tests integration con DB real (E2E aislamiento dos tenants con RLS activo)
- [ ] Email template builder (actualmente HTML inline en magic-link.service)
- [ ] Webhook signature rotation procedure
- [ ] Phase 05 polish

## Validado E2E en prod (sesión actual)

✅ Migración aditiva sin downtime — 9 companies + 63 DTEs intactos
✅ Login admin → JWT scope=admin
✅ `/me`, `/metrics/overview`, `/tenants`, `/plans` responden con datos reales
✅ Cierre revenue-share tenant=app period=2026-04: $48k cont + $20k rem = **$68k** (match exacto del ejemplo del plan)
✅ Inject en invoice: subtotal $117k + IVA $22.230 = **$139.230 total**
✅ Status transitions: run `ready` → `invoiced` con `invoice_id` correcto

Lo único que falta validar contra prod son los 4 nuevos crons + el endpoint PDF + la UI de 2FA — pendiente del próximo deploy.
