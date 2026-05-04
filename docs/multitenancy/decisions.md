# Decisiones bloqueantes — responder antes de Fase 00

Cada decisión tiene una recomendación. Si la aceptas tal cual, marca con [x] y el plan queda listo para ejecutar. Si la cambias, escribe la elección en la línea "ELECCIÓN".

---

## D1 — Modelo de tenancy
- [x] Recomendado: **Shared DB + `tenant_id` + RLS Postgres** (un solo deploy, fila etiquetada, policy por tenant).
- [ ] Alternativa: schema-per-tenant.
- [ ] Alternativa: DB-per-tenant.
- ELECCIÓN: Shared DB + `tenant_id` + RLS Postgres.

## D4 — Quién es el tenant
- [x] Recomendado: **El contador / despacho contable** (mantiene N empresas dentro).
- [ ] Alternativa: la PYME directa.
- ELECCIÓN: El contador / despacho contable.

## D5 — Pasarela de pago (CLP recurrente)
- [ ] Recomendado: **Flow.cl** (suscripciones nativas, API simple).
- [ ] Alternativa: Webpay Plus + Oneclick (Transbank).
- [ ] Alternativa: Stripe (con adquirente CL).
- [x] Alternativa: **Mercado Pago** (suscripciones recurrentes vía `preapproval`, CLP).
- ELECCIÓN: Mercado Pago.

## D10 — Origen de los honorarios para revenue-share
- [x] Recomendado: **Declarado por el contador** en `tenant_fees` (monto fijo mensual por PYME). Predecible, cero disputas.
- [ ] Alternativa: detectado automáticamente por DTE 33/34 emitido del contador a la PYME (matching por glosa/categoría).
- [ ] Alternativa: híbrido (declarado + override por evento).
- ELECCIÓN: Declarado por el contador en `tenant_fees`.

## D-Pricing — Aplicación del revenue-share
- [ ] Recomendado: **20%/20% en todos los planes**, base mensual baja.
- [ ] Alternativa: revenue-share solo en plan Starter, planes Pro/Enterprise pagan flat más alto.
- [ ] Alternativa: opt-in por tenant (tarifa más alta sin share).
- [x] Alternativa: **Editable por tenant, prellenado 20/20**. Cada tenant tiene `revenue_share_pct` (default 20) y `partner_share_pct` (default 20), modificables desde admin.
- ELECCIÓN: Editable por tenant; defaults 20/20.

## D-Hosting — Infraestructura
- [x] Recomendado: **Mantener Coolify/VPS actual**, agregar admin app y workers de billing.
- [ ] Alternativa: migrar a Kubernetes / Fly / Railway.
- ELECCIÓN: Coolify/VPS actual + admin app + workers.

## D-DNS — Provider para wildcard + DNS-01 SSL
- [x] Recomendado: **Cloudflare** (API estable, plan free OK, DNS-01 challenge soportado por certbot).
- [ ] Alternativa: Route53.
- [ ] Alternativa: provider actual (especificar).
- ELECCIÓN: Cloudflare.

---

Cuando tengas todas marcadas, corre:
```bash
make tenancy-phase PHASE=00
```
