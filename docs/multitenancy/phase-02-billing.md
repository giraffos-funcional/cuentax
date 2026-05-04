# Fase 02 — Suscripciones + cobro recurrente (Mercado Pago)

## Objetivo
Cobrar la suscripción base de cada tenant en CLP de forma automática vía **Mercado Pago** (D5: `preapproval` + Checkout Pro/Bricks), con reintentos, facturación electrónica DTE 33 emitida por Cuentax al tenant, customer portal para administrar tarjeta y plan, y suspensión automática por mora.

## Prerrequisitos
- Fase 00 (tenants) y Fase 01 (admin) terminadas.
- Cuenta Mercado Pago Chile con `MP_ACCESS_TOKEN` (prod) y `MP_PUBLIC_KEY` + credenciales sandbox/test.
- Cuentax con CAF cargado para emitir DTE 33 a sus tenants (auto-facturación de la propia plataforma).

## Archivos a crear / modificar

### Nuevos
- `packages/billing/` — paquete shared
  - `src/providers/mercadopago.ts` — `MercadoPagoProvider` (preapproval + payments)
  - `src/providers/index.ts`
  - `src/types.ts`
- `apps/bff/src/db/schema/billing.ts` — `subscriptions`, `invoices`, `invoice_line_items`, `payments`, `dunning_attempts`
- `apps/bff/src/services/billing/`
  - `subscription.ts`
  - `invoice-generator.ts`
  - `dunning.ts`
  - `webhooks.ts`
- `apps/bff/src/jobs/`
  - `generate-monthly-invoices.ts` (cron 1° del mes 02:00 CLT)
  - `charge-due-invoices.ts` (cron diario 09:00 CLT)
  - `dunning.ts` (cron diario 10:00 CLT)
- `apps/bff/src/routes/billing.ts` — endpoints para el tenant (customer portal)
- `apps/bff/src/routes/webhooks/mercadopago.ts`
- `apps/web/src/app/(billing)/billing/page.tsx` — customer portal del tenant
- `apps/web/src/app/(billing)/billing/methods/page.tsx`
- `apps/web/src/app/(billing)/billing/invoices/page.tsx`
- `apps/admin/src/app/(dashboard)/billing/page.tsx` — vista global

### Modificar
- `apps/admin/src/app/(dashboard)/tenants/[slug]/page.tsx` — tab de billing real
- `infra/nginx/nginx.prod.conf` — exponer `/api/v1/webhooks/mercadopago` (sin auth, valida firma `x-signature` HMAC SHA-256 con `MP_WEBHOOK_SECRET`)
- `.env.example` — `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`, `MP_BASE_URL` (default `https://api.mercadopago.com`), `MP_NOTIFICATION_URL`

## Schema (referencia)

```ts
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
  plan_id: integer('plan_id').notNull().references(() => plans.id),
  status: subscriptionStatusEnum('status').notNull(),
  current_period_start: timestamp('current_period_start', { withTimezone: true }).notNull(),
  current_period_end: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancel_at_period_end: boolean('cancel_at_period_end').default(false),
  payment_provider: varchar('payment_provider', { length: 16 }).notNull().default('mercadopago'),
  // En Mercado Pago: ID del recurso `preapproval` (suscripción)
  provider_subscription_id: varchar('provider_subscription_id', { length: 64 }),
  payment_method_token: varchar('payment_method_token', { length: 255 }), // card_token MP
  trial_ends_at: timestamp('trial_ends_at', { withTimezone: true }),
  created_at: timestamp('created_at').defaultNow(),
})

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  subtotal_clp: integer('subtotal_clp').notNull(),
  iva_clp: integer('iva_clp').notNull(),
  total_clp: integer('total_clp').notNull(),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  dte_id: integer('dte_id'), // FK al DTE 33 emitido a este tenant
  issued_at: timestamp('issued_at'),
  due_at: timestamp('due_at'),
  paid_at: timestamp('paid_at'),
  metadata: jsonb('metadata'),
})
```

## Tareas

- [ ] T2.1 — Diseñar tabla de planes en producción y cargarlos vía seed.
- [ ] T2.2 — Migración Drizzle para `subscriptions`, `invoices`, `invoice_line_items`, `payments`, `dunning_attempts`. RLS habilitado en todas con `tenant_id`.
- [ ] T2.3 — `packages/billing` con interfaz `BillingProvider` e implementación `MercadoPagoProvider` (dejar la interfaz preparada para sumar Webpay/Stripe sin refactor). Cada provider expone:
  - `createCustomer(tenant)` — POST `/v1/customers`
  - `createSubscription(tenant, plan)` — POST `/preapproval` con `auto_recurring` (frequency=1, frequency_type=`months`, transaction_amount, currency_id=`CLP`)
  - `chargeOneTime(tenant, amount, description)` — POST `/v1/payments` (con `customer.id` + `token` o `card_id`) para overage
  - `attachPaymentMethod(tenant, cardToken)` — POST `/v1/customers/{id}/cards`
  - `cancelSubscription(subscriptionId)` — PUT `/preapproval/{id}` con `status=cancelled`
- [ ] T2.4 — Endpoint público `POST /api/v1/billing/setup-intent` — devuelve `init_point` del `preapproval` MP para que el tenant ingrese tarjeta. Alternativa Bricks: devolver `MP_PUBLIC_KEY` + `preapproval_plan_id` para SDK frontend.
- [ ] T2.5 — Webhook `POST /api/v1/webhooks/mercadopago`:
  - Valida firma `x-signature` (HMAC-SHA256 con `MP_WEBHOOK_SECRET`, body `id:<dataID>;request-id:<x-request-id>;ts:<ts>;`).
  - Procesa topics: `payment` (`payment.created`, `payment.updated`), `preapproval` (`authorized`, `paused`, `cancelled`), `subscription_authorized_payment` (cobro recurrente exitoso/fallido).
  - GET al recurso (`/v1/payments/{id}` o `/preapproval/{id}`) para confirmar estado real.
  - Actualiza `payments` e `invoices` (idempotencia por `provider_txn_id` = MP `payment.id`).
  - Si `status=approved` → tenant pasa de `past_due` a `active`.
- [ ] T2.6 — Cron `generate-monthly-invoices.ts` (1° de cada mes 02:00):
  1. Para cada tenant `active` o `past_due`:
  2. Calcular: precio base + overage (DTEs sobre el incluido del plan).
  3. Crear `invoice` draft con line items `subscription` y `overage`.
  4. Disparar emisión de DTE 33 (vía servicio existente `apps/bff/src/services/dte`) — Cuentax a tenant, RUT + razón social del tenant.
  5. Marcar `invoice.status='issued'`, guardar `dte_id`.
- [ ] T2.7 — Cron `charge-due-invoices.ts` (diario 09:00):
  - Cobra invoices con `due_at <= today AND status='issued'`.
  - Llama provider, registra `payment` con resultado.
  - Si éxito: `paid`. Si falla: `past_due` y agendar dunning.
- [ ] T2.8 — Cron `dunning.ts`:
  - Día 0 (vencimiento): email "tu pago no se procesó".
  - Día +3: reintento + email.
  - Día +7: reintento + email final + restringir features (read-only).
  - Día +14: tenant pasa a `suspended` (Fase 00 ya redirige).
  - Día +30: notificación a admin para evaluar cancelación.
- [ ] T2.9 — Customer portal en `apps/web`:
  - Vista actual del plan y consumo.
  - Cambiar plan (downgrade efectivo siguiente período, upgrade prorrateado).
  - Actualizar tarjeta.
  - Lista de facturas con descarga PDF (DTE).
  - Cancelar (con encuesta).
- [ ] T2.10 — Vista admin: lista de invoices del mes, dunning runs, tasa de éxito de cobro, tenants morosos.
- [ ] T2.11 — Tests:
  - Generación de invoice con data fixture (tenant, plan, uso de DTEs).
  - Webhook MP con `x-signature` válida e inválida (vector de prueba en fixtures).
  - Dunning: simular pagos fallidos día 0/3/7/14 y verificar transiciones.
  - Cambio de plan prorrateado.
- [ ] T2.12 — Sandbox end-to-end con credenciales MP TEST: crear tenant, agregar tarjeta de prueba (`APRO`/`OTHE`), generar invoice, cobrar (preapproval auto-charge), verificar webhook firmado.

## Comandos

```bash
# Migraciones + seed planes
cd apps/bff && pnpm drizzle-kit generate && pnpm drizzle-kit migrate
pnpm exec tsx scripts/seed-plans.ts

# Tests
pnpm -w test --filter @cuentax/bff
pnpm -w test --filter @cuentax/billing

# Dev (con MP TEST)
MP_ACCESS_TOKEN=TEST-... MP_PUBLIC_KEY=TEST-... MP_BASE_URL=https://api.mercadopago.com pnpm --filter @cuentax/bff dev

# Probar webhook localmente
ngrok http 4000
# Configurar en panel MP (Webhooks): URL = https://<ngrok>/api/v1/webhooks/mercadopago
# Eventos: payment, subscription_authorized_payment, preapproval

# Crear suscripción manual (admin)
curl -X POST https://admin.cuentax.cl/api/admin/tenants/demo/subscription \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"plan_code":"pro"}'
```

## Criterios de aceptación

1. Tenant nuevo en plan Pro: el día 1 del mes recibe invoice con DTE 33 válido emitido al SII.
2. Cobro automático funciona en sandbox con tarjeta de prueba.
3. Webhook con firma inválida → 401.
4. Pago fallido reproducible: tenant pasa a `past_due` día 0, recibe 3 emails, suspendido día 14.
5. Customer portal permite cambiar tarjeta y plan sin tocar DB manualmente.
6. Cancelar tenant cumple `cancel_at_period_end=true` y mantiene servicio hasta fin de ciclo.
7. Tests verdes incluyendo sandbox e2e.

## Riesgos

- **DTE 33 propio**: Cuentax debe tener CAF y cert SII propios para emitir a sus tenants. Verificar setup antes de empezar.
- **Idempotencia de webhooks**: MP reenvía eventos hasta recibir 200. Usar `provider_txn_id` (MP `payment.id`) como unique key en `payments`. Responder 200 rápido y procesar async si hace falta.
- **MP `preapproval` vs cobro one-shot**: para suscripción base usar `preapproval` (auto-charge mensual). Para overage (consumo variable) usar `payment` one-shot contra el `customer.id` + `card_id` ya guardado — `preapproval` no soporta montos variables sin recrear la suscripción.
- **CLP sin decimales**: MP exige `transaction_amount` como número; CLP no usa decimales pero MP los acepta. Pasar siempre enteros y validar.
- **Doble cobro en upgrade prorrateado**: cuidar la lógica de prorrateo y testear con casos borde (cambio el último día del mes). En MP, upgrade = cancelar `preapproval` viejo + crear nuevo + cobrar diferencia con `payment` one-shot.
- **Firma de webhook**: validar siempre `x-signature` y `x-request-id`. Sin secret configurado MP no firma — bloquea deploy si falta `MP_WEBHOOK_SECRET`.
- **Modo sandbox vs prod**: feature flag estricto `BILLING_ENV`. Tokens MP TEST vs APP claramente separados, logs distintos.
- **Tributario**: confirmar con contador que el DTE 33 al tenant es el documento correcto y la base imponible está bien (precio neto, IVA 19%).
