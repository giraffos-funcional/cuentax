# Estado de ejecución — Plan multi-tenancy

> Snapshot al 2026-05-04 16:40 (post Fase 04 backend+UI). Actualizar al cerrar cada fase.

## Resumen ejecutivo

| Fase | Estado | Notas |
|---|---|---|
| 00 — Foundation                                  | ✅ done en prod              | tenants, plans, RLS helpers, middleware, RLS SQL policy, certbot/nginx scripts. |
| 01 — Admin Console                               | 🟢 95%                        | backend completo, UI lista; falta 2FA TOTP + deploy del admin app a Coolify. |
| 02 — Billing (Mercado Pago)                      | 🟢 80%                        | schema, pkg billing+MP, webhook, endpoints, invoice generator, cron BullMQ, customer portal. **Falta:** creds MP en Coolify, cron charge-due (necesita MP), dunning. |
| 03 — Revenue share                               | ✅ 100% backend + UI          | calculator/closer/injector, cron BullMQ, admin runs+bulk close, UI honorarios para contador. |
| 04 — Self-serve onboarding                       | 🟢 60%                        | endpoint signup público + UI. **Falta:** email magic-link primer login. |
| 05 — Polish + enterprise                         | ⏸ no iniciada                |  |

## Endpoints en prod (cuentaxapi.giraffos.com)

### `/api/admin/*` — super-admin (scope=admin JWT)
- `POST /auth/login`
- `GET  /me`
- `GET/POST /tenants`, `GET/PATCH /tenants/:slug`
- `POST /tenants/:slug/suspend|reactivate`
- `PATCH /tenants/:slug/revenue-share`
- `POST /tenants/:slug/impersonate`
- `GET  /plans`
- `GET  /metrics/overview`
- `GET  /audit`
- `POST /admins`
- `GET  /invoices`
- `POST /billing/invoices/generate`
- `GET  /revenue-share/runs`
- `POST /revenue-share/close`
- `POST /revenue-share/runs/:id/lock`
- `POST /revenue-share/runs/:id/inject`

### `/api/v1/*` — tenant-scoped
- `/billing/setup-intent`, `/billing/subscription`, `/billing/invoices`
- `/tenant-fees` CRUD + `/tenant-fees/projection`
- `/webhooks/mercadopago` (HMAC firmado)
- `/signup` y `/signup/slug-available` (público, rate-limited)

## Apps

- **`apps/bff`** (cuentaxapi.giraffos.com) — Fastify, multi-tenant
- **`apps/web`** (cuentaxweb.giraffos.com) — Next.js tenant-facing. Pages: dashboard estándar + `/dashboard/honorarios` + `/dashboard/billing` + `/signup`.
- **`apps/admin`** — Next.js admin console. **Pendiente desplegar** como app Coolify nueva en `cuentaxadmin.giraffos.com` o `admin.cuentax.cl`.
- **`apps/sii-bridge`** (cuentaxbridge.giraffos.com) — Python FastAPI, intacto.

## Crons BullMQ

- `dte-status-polling` — DTE status (existente)
- `dte-mailbox-poller` — IMAP listener (existente)
- `previred-scraper` — (existente)
- `rcv-sync` — (existente)
- **`close-revenue-share`** — `0 7 1 * * UTC` (~04:00 CLT día 1) — Fase 03
- **`generate-monthly-invoices`** — `0 5 1 * * UTC` (~02:00 CLT día 1) — Fase 02

## Pendiente para 100% Fases 01–04

### Crítico
- [ ] **MP credentials** en Coolify (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_PUBLIC_KEY`) — sin esto `setup-intent` y webhook no funcionan
- [ ] **Deploy admin app** a Coolify (nueva app con dominio propio)
- [ ] **Cron charge-due-invoices** (necesita MP)
- [ ] **Cron dunning** (necesita MP)
- [ ] **Email provider** para magic-link signup + bienvenida (Postmark/Resend)

### Importante
- [ ] **2FA TOTP** para super-admins (placeholder columns existen)
- [ ] **PDF export** de invoices del customer portal
- [ ] Email notification de revenue-share run (ventana 48h objeción)

### Nice-to-have
- [ ] **Server dedicado CCX13** Hetzner (espera tu activación)
- [ ] DNS Cloudflare wildcard + SSL `*.cuentax.cl`
- [ ] Nginx admin + wildcard tenant subdomain
- [ ] Tests integration con DB real (E2E aislamiento dos tenants)
- [ ] Override manual de revenue-share runs desde admin UI

## Tests

- `packages/tenancy`: 22 tests
- `packages/billing`: 6 tests (HMAC validation, createSubscription, chargeOneTime)
- `apps/bff`: 97 tests (incluye 10 nuevos de revenue-share period helpers + share math)

**Total: 125 tests verdes.**
