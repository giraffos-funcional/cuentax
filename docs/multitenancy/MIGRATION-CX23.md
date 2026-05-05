# Migración a Cuentax-Prod (CX23) — Estado al handoff

> Snapshot 2026-05-05 19:25. Usuario salió 40min. Toda la infra está lista para cut-over DNS.

## Servers

| Server | IP | Rol |
|---|---|---|
| **Cuentax-Prod** (CX23, 4GB) | `178.104.215.121` | NUEVO — Coolify v4 + apps + DB |
| Giraffos-coolify (SV1) | `89.167.54.33` | Coolify viejo, no usar para Cuentax |
| Giraffos-Data-Services | `89.167.46.146` | DB vieja Cuentax — apagar tras cut-over |

## Coolify nuevo

- **URL**: http://178.104.215.121:8000
- **API token**: `1|JsPCkGyZqQwhMuKRGvfO4osUucUaIyweFdJO4JOO2611571f`
- **Project**: `cuentax` (uuid `ik1lqwb0k5eyv8cjs9a560i2`)
- **GitHub App**: `cuentax-prod` (uuid `j1rvcq33ysy6ne82btegjqpv`) instalada en org `giraffos-funcional` con acceso al repo `cuentax`

### Recursos creados

| Recurso | UUID | Estado |
|---|---|---|
| `cuentax-postgres` | `qvvh3w44jqzw479axqxr6jgl` | running:healthy, **datos restaurados** del SV1 |
| `cuentax-redis` | `d41b0s084yjk31bbjzsk8upc` | running |
| `cuentax-bff` | `csbfa7rxkbfve2vvutlvj8za` | deploying |
| `cuentax-web` | `x24l4rp9u3sc4x5wswiw4y57` | deploying |
| `cuentax-admin` | `q11tsobv15gyhmzbpir50q5f` | deploying |
| `cuentax-sii-bridge` | `s5pr377r8vk9uv3umbgroi2k` | deploying |

### DB restaurada

```
tenants       6
companies     9
dte_documents 63
audit_log     12
invoices      2
tenant_fees   5
super_admins  1
```

Todo OK. El backup se hizo con `pg_dump --clean --no-owner --no-privileges` desde el SV1 y se restauró en el CX23 vía conexión pública temporal (puerto 25434, ya cerrado).

## Cut-over DNS — qué tenés que hacer al volver

Cambiar 4 records A en Cloudflare apuntando al CX23:

| Nombre | Tipo | Contenido | Proxy |
|---|---|---|---|
| `cuentax.giraffos.com` | A | `178.104.215.121` | DNS only |
| `cuentaxapi.giraffos.com` | A | `178.104.215.121` | DNS only |
| `cuentaxbridge.giraffos.com` | A | `178.104.215.121` | DNS only |
| `cuentaxadmin.giraffos.com` | A | `178.104.215.121` | DNS only |

(El último — `cuentaxadmin` — es nuevo, no existía antes.)

TTL bajo (5 min) para propagación rápida.

## Validación post-cut-over

Cuando los DNS hayan propagado (~5 min), validar:

```bash
# DNS resuelve al nuevo IP
dig +short cuentaxapi.giraffos.com  # debe ser 178.104.215.121

# BFF
curl -sk https://cuentaxapi.giraffos.com/health | jq

# Login admin (usuario sigue siendo el mismo)
curl -sk -X POST https://cuentaxapi.giraffos.com/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"francisco@giraffos.com","password":"AArkeuec-uA11wgsB0vo_n3O"}' | jq

# Web
curl -sk -o /dev/null -w "%{http_code}\n" https://cuentax.giraffos.com/login

# Admin app (NUEVA)
curl -sk -o /dev/null -w "%{http_code}\n" https://cuentaxadmin.giraffos.com/login
```

## SSL (auto via Coolify Let's Encrypt)

Coolify v4 emite cert automáticamente cuando el DNS apunta correctamente. Si querés forzar:
- Dashboard → cuentax-bff → SSL → Generate / Renew (cert disponible en ~30s)

## Apagar infra vieja (cuando confirmes que CX23 anda 100%)

1. Coolify SV1: pausar las apps `cuentax-bff`, `cuentax-web`, `cuentax-sii-bridge`, `cuentax-landing` (no las elimines aún — backup)
2. Apagar el Postgres viejo `cuentax-postgres` en `Giraffos-Data-Services`
3. Después de 1 semana de uptime confirmado en CX23, eliminar todo Cuentax del SV1 + apagar `Giraffos-Data-Services` (CX33) si solo lo usabas para esta DB

## Env vars críticos en CX23 (ya cargados)

**BFF** (18 vars): DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, INTERNAL_SECRET, ALLOWED_ORIGINS, TENANT_ROOT_DOMAINS, TENANT_RESOLVER_CACHE_TTL, TENANT_DEFAULT_PLAN, EMAIL_PROVIDER (log), EMAIL_FROM, PUBLIC_BASE_URL, BILLING_BACK_URL, SII_BRIDGE_URL, SII_BRIDGE_FALLBACK_URLS, NODE_ENV, PORT (4000), NIXPACKS_NODE_VERSION (20).

**Web** (5): NODE_ENV, PORT (3000), NIXPACKS_NODE_VERSION, NEXT_PUBLIC_BFF_URL, NEXT_PUBLIC_APP_NAME.

**Admin** (4): NODE_ENV, PORT (3001), NIXPACKS_NODE_VERSION, BFF_URL.

**Pendiente que cargues vos** (cuando los tengas):
- Mercado Pago: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_PUBLIC_KEY`, `MP_BASE_URL`, `MP_NOTIFICATION_URL`
- Email Postmark: `EMAIL_PROVIDER=postmark` + `POSTMARK_TOKEN` (hoy va al log)
- Odoo: `ODOO_URL`, `ODOO_DB`, `ODOO_ADMIN_USER`, `ODOO_ADMIN_PASSWORD`, `ODOO_PUBLIC_URL` (los del SV1 servían — copialos)
- Bank scraper: `BANK_SCRAPER_URL`, `BANK_SCRAPER_SECRET`

## Deploys en progreso

UUIDs de los deploys disparados (puede chequearse en el dashboard Coolify):
- BFF: `bulietr8qbbezb69olk893hu`
- Web: `kc76pkyqzthojld2gfzu8pkv`
- Admin: `o60davyklwgaq1ia2wv7nrok`
- SII Bridge: `f14b8r7u089umcv0knl7mt55`

## Cosas que voy a chequear yo durante los 40 min

- [ ] Que los 4 deploys terminen verde
- [ ] Que health del BFF responda 200 cuando puerto interno esté listo
- [ ] Que la DB siga healthy después de los deploys
- [ ] Logs si algún build falla
