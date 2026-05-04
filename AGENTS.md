# CUENTAX — Contexto de Infraestructura para Agentes
<!-- Este archivo es leído por los agentes de IA antes de operar sobre el proyecto -->

## Coolify (Plataforma de Deploy)

| Variable | Valor |
|----------|-------|
| **URL** | `https://deploy.giraffos.com` |
| **IP directa** | `89.167.54.33:8443` |
| **API Token** | `1\|393zYVmXBz07CPnylFUcbPe4EIA1osoirVzmrvrr9a2aa4f7` |

### Uso rápido de la API

```bash
# Alias recomendado para la sesión
export COOLIFY_TOKEN="1|393zYVmXBz07CPnylFUcbPe4EIA1osoirVzmrvrr9a2aa4f7"
export COOLIFY_URL="https://deploy.giraffos.com"

# Listar servidores
curl -s "$COOLIFY_URL/api/v1/servers" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq .

# Listar proyectos
curl -s "$COOLIFY_URL/api/v1/projects" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq .

# Listar aplicaciones
curl -s "$COOLIFY_URL/api/v1/applications" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq .

# Deploy de una aplicación por UUID
curl -s -X POST "$COOLIFY_URL/api/v1/applications/{UUID}/deploy" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq .

# Ver recursos de un servidor
curl -s "$COOLIFY_URL/api/v1/servers/{UUID}/resources" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | jq .
```

## Servidores Conocidos

| Servidor | IP | Uso | ⚠️ Restricción |
|----------|-----|-----|----------------|
| **SV1** | `89.167.54.33` | Apps producción Giraffos | Normal |
| **Binario** | TBD | Proyecto Binario | 🔴 **NO TOCAR NUNCA** |

## Proyectos en Producción (Giraffos SV1)

| Dominio | Proyecto | Notas |
|---------|----------|-------|
| `infra.giraffos.com` | giraffos-infra | Dashboard infra |
| `whatsapp.giraffos.com` | WAHA | WhatsApp API |
| `deploy.giraffos.com` | Coolify | La propia plataforma |

## CUENTAX — Dominios Target

| Dominio | Servicio | Puerto interno |
|---------|---------|----------------|
| `cuentax.cl` | Next.js web | 3000 |
| `api.cuentax.cl` | BFF Fastify | 4000 |
| `erp.cuentax.cl` | Odoo 18 | 8069 |

## Instrucciones para Agentes

1. **NUNCA** modificar aplicaciones del servidor Binario
2. Antes de crear recursos en Coolify, siempre listar los existentes y confirmar con el usuario
3. El token de arriba es de producción — no exponer en logs ni commits
4. Para deployar CUENTAX, usar `docker-compose.prod.yml` en el repositorio
5. El registro de imágenes Docker es: `ghcr.io/giraffos-funcional/cuentax-{web,bff,sii-bridge}`

## Comandos de Verificación

```bash
# Health check Coolify
curl -s https://deploy.giraffos.com/api/v1/healthcheck \
  -H "Authorization: Bearer $COOLIFY_TOKEN"

# Ver versión Coolify
curl -s https://deploy.giraffos.com/api/v1/version \
  -H "Authorization: Bearer $COOLIFY_TOKEN"
```

## Multi-tenancy (Phase 00 onward)

Cuentax usa **un deploy compartido** con aislamiento por `tenant_id` y RLS Postgres. Cada tenant es un **contador / despacho contable** y administra N companies (PYMEs).

### Reglas para nuevas tablas

Cualquier tabla nueva con datos de negocio (DTE, facturas, contactos, etc.) debe:

1. **Llevar `tenant_id`** directo si es first-class para el tenant (e.g. `tenant_fees`, `subscriptions`), o
2. **Llevar `company_id`** y heredar tenant via `companies.tenant_id` (la regla más común).
3. **Tener policy RLS** registrada en `infra/postgres/rls-policies.sql` (las basadas en `company_id` se agregan al array `tables` del `DO $$ … END $$` block).
4. **No usar `db` directamente** en handlers tenant-scoped: usar `withTenantTx(tenantId, async (tx) => …)` desde `@/db/with-tenant`.

### Subdominios reservados

Lista en `packages/tenancy/src/reserved.ts`. No usar `admin`, `api`, `www`, `webhooks`, etc. como slug de tenant.

### Variables de entorno relevantes

- `TENANT_ROOT_DOMAINS` — dominios apex separados por coma (`cuentax.cl,cuentax.local`).
- `TENANT_RESOLVER_CACHE_TTL` — segundos de cache Redis para slug → tenant (default 60).
- `TENANT_DEFAULT_PLAN` — plan code por defecto en provisioning self-serve.

### Refs

- `docs/multitenancy/README.md` — índice de fases.
- `docs/multitenancy/decisions.md` — decisiones cerradas (D1 shared DB+RLS, D5 Mercado Pago, etc.).
- `docs/multitenancy/phase-00-foundation.md` — tickets atomic ejecutables.
