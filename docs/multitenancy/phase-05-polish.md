# Fase 05 — Pulido + Enterprise (continuo)

## Objetivo
Después del MVP funcional, mejorar márgenes, retención y atender despachos grandes. Esta fase NO es secuencial — son tickets independientes que se priorizan según demanda.

## Tickets disponibles (sin orden estricto)

### 5.1 Dominio propio del tenant
- Permitir que `contabilidad-perez.cl` apunte a Cuentax con CNAME.
- Validación de DNS (CNAME a `tenants.cuentax.cl`).
- Issue de cert por demanda con Let's Encrypt + ACME.
- Tabla `tenant_domains` (tenant_id, host, verified, ssl_status).

### 5.2 White-label completo
- Emails transaccionales con SMTP del tenant (configurable).
- "Powered by Cuentax" opcional desactivable en plan Enterprise.
- Favicon, OG image y meta por tenant.

### 5.3 Tier "DB dedicada"
- Para despachos grandes: postgres separado por tenant.
- Manifest YAML por tenant que define `database_url` particular.
- Migración asistida desde shared a dedicada (sin downtime, replication-based).

### 5.4 SLA + Status page por tenant
- Health checks por tenant cada 30s.
- Status page público en `status.cuentax.cl` y por tenant `status.{slug}.cuentax.cl`.
- Incident management básico.

### 5.5 Programa de partners / referidos
- Cada tenant puede invitar otros tenants con código.
- Comisión recurrente (e.g. 10% del MRR del referido por 12 meses).
- Tabla `referrals` y dashboard.

### 5.6 Integración bancaria por tenant
- Cada tenant puede conectar su banco (BCI, Banco de Chile, Santander) via scraper o Open Banking cuando esté disponible.
- Conciliación automática.

### 5.7 API pública por tenant
- API key scoping por tenant.
- Rate limit por tenant.
- Documentación con OpenAPI dinámica.

### 5.8 Webhooks salientes por tenant
- Tenant configura URLs propias para eventos (DTE emitido, pago recibido, etc.).
- Reintentos exponenciales + dead letter queue.

### 5.9 Auditoría avanzada
- Export completo de audit log a S3/B2 con retención 7 años.
- Búsqueda y filtrado avanzado en admin.

### 5.10 Multi-currency / multi-país
- Preparar el modelo para Perú, Colombia, México.
- `country_code` por tenant, formatos tributarios distintos.
- Reusar el patrón actual de `country_code` en `companies`.

## Cómo priorizar

Tomar los tickets de esta fase a medida que:
- Un cliente enterprise lo pida con contrato firmado (5.1, 5.2, 5.3).
- Las métricas muestren que es la siguiente palanca (5.5 si CAC alto, 5.4 si churn por uptime).
- Sea bloqueante para una integración de partner (5.7, 5.8).

## Criterios de aceptación
N/A — cada sub-ticket se documentará como `phase-05-NN-slug.md` cuando se priorice.
