# Fase 03 — Revenue-share 20%/20%

## Objetivo
Capturar lo que cada contador (tenant) le cobra mes a mes a sus PYMEs por **contabilidad** y **remuneraciones**, calcular el 20% por cada concepto, e inyectarlo como line item en el invoice mensual de Cuentax al tenant.

## Prerrequisitos
- Fase 02 (billing + invoices) terminada.
- D10 resuelto. Este ticket asume **opción A**: el contador declara honorarios fijos por PYME en `tenant_fees`. Si elegiste otra opción, ajustar antes de empezar.

## Archivos a crear / modificar

### Nuevos
- `apps/bff/src/db/schema/revenue-share.ts` — `tenant_fees`, `revenue_share_runs`
- `apps/bff/src/services/revenue-share/`
  - `calculator.ts`
  - `closer.ts`
  - `injector.ts`
- `apps/bff/src/jobs/close-revenue-share.ts` — cron 1° del mes 04:00 CLT
- `apps/bff/src/routes/tenant-fees.ts` — CRUD para el contador
- `apps/web/src/app/(dashboard)/honorarios/page.tsx` — UI del contador
- `apps/web/src/app/(dashboard)/honorarios/[companyId]/page.tsx` — fee por PYME
- `apps/admin/src/app/(dashboard)/revenue-share/page.tsx` — vista global
- `apps/bff/src/__tests__/revenue-share.test.ts`

### Modificar
- `apps/bff/src/services/billing/invoice-generator.ts` — incluir line items de revenue-share antes de issue.
- `apps/admin/.../tenants/[slug]/page.tsx` — tab "revenue-share" con histórico.

## Schema (referencia)

```ts
export const feeTypeEnum = pgEnum('fee_type', ['contabilidad', 'remuneraciones'])

export const tenantFees = pgTable('tenant_fees', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
  company_id: integer('company_id').notNull().references(() => companies.id),
  fee_type: feeTypeEnum('fee_type').notNull(),
  monthly_clp: integer('monthly_clp').notNull(),
  billing_day: integer('billing_day').notNull().default(1),
  active: boolean('active').notNull().default(true),
  valid_from: date('valid_from').notNull(),
  valid_to: date('valid_to'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow(),
}, (t) => ({
  tenantCompanyTypeIdx: uniqueIndex('tenant_fee_unique')
    .on(t.tenant_id, t.company_id, t.fee_type, t.valid_from),
  activeIdx: index('tenant_fee_active_idx').on(t.tenant_id, t.active),
}))

export const revenueShareRuns = pgTable('revenue_share_runs', {
  id: serial('id').primaryKey(),
  tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  status: varchar('status', { length: 20 }).notNull(), // calculating|ready|invoiced|paid|locked
  total_contabilidad_clp: integer('total_contabilidad_clp').notNull().default(0),
  total_remuneraciones_clp: integer('total_remuneraciones_clp').notNull().default(0),
  share_contabilidad_clp: integer('share_contabilidad_clp').notNull().default(0),
  share_remuneraciones_clp: integer('share_remuneraciones_clp').notNull().default(0),
  total_share_clp: integer('total_share_clp').notNull().default(0),
  rate_contabilidad: decimal('rate_contabilidad', { precision: 5, scale: 4 }).notNull(),
  rate_remuneraciones: decimal('rate_remuneraciones', { precision: 5, scale: 4 }).notNull(),
  invoice_id: integer('invoice_id').references(() => invoices.id),
  detail: jsonb('detail'), // breakdown por company_id
  calculated_at: timestamp('calculated_at'),
  locked_at: timestamp('locked_at'),
}, (t) => ({
  tenantPeriodIdx: uniqueIndex('rs_run_tenant_period').on(t.tenant_id, t.period),
}))
```

## Tareas

- [ ] T3.1 — Migración Drizzle: `tenant_fees`, `revenue_share_runs`. RLS por `tenant_id`.
- [ ] T3.2 — Endpoints `/api/v1/tenant-fees`:
  - `GET /tenant-fees?company_id=X` — lista
  - `POST /tenant-fees` — crear
  - `PATCH /tenant-fees/:id`
  - `DELETE /tenant-fees/:id` — soft delete (set `valid_to=today`, `active=false`)
  - `GET /tenant-fees/projection?period=YYYY-MM` — proyección de revenue-share del mes
- [ ] T3.3 — UI Honorarios:
  - Lista de PYMEs (companies del tenant) con sus fees actuales (contabilidad + remuneraciones).
  - Editor inline para setear/cambiar montos.
  - Banner: "Revenue-share proyectado para {período}: $X" con desglose por PYME.
  - Aviso: "los cambios de hoy aplican al cálculo del mes en curso".
- [ ] T3.4 — Servicio `calculator.ts`:
  ```ts
  function calculateRevenueShare(tenantId: number, period: string): RevenueShareResult
  ```
  - Lee `tenant_fees` activos del período (intersect `valid_from`/`valid_to`).
  - Suma por `fee_type`.
  - Aplica `tenants.revenue_share_rate_contabilidad` y `tenants.revenue_share_rate_remuneraciones` (defaults 0.20/0.20, editables por tenant desde admin — ver D-Pricing y phase-00).
  - Persiste en `revenue_share_runs.rate_contabilidad/rate_remuneraciones` el rate aplicado en el momento del cierre (snapshot inmutable).
  - Devuelve totales + breakdown por PYME (`detail` jsonb).
- [ ] T3.5 — Cron `close-revenue-share.ts` (1° del mes 04:00 CLT):
  - Para cada tenant `active`:
    1. Crea `revenue_share_runs` (status=`calculating`).
    2. Llama `calculator`.
    3. Status `ready`. Notifica al contador por email con el detalle.
    4. **Ventana de objeción de 48h**: el contador puede pedir ajuste vía soporte. Después se hace `lock` y se inyecta en invoice.
- [ ] T3.6 — Servicio `injector.ts`: cuando el invoice mensual del tenant entra en estado `draft`, agrega line items:
  - `revenue_share_contabilidad`: $X
  - `revenue_share_remuneraciones`: $Y
  - Marca `revenue_share_runs.invoice_id` y status `invoiced`.
- [ ] T3.7 — Reporte para el contador en `apps/web`:
  - Histórico mensual de revenue-share pagado.
  - Detalle por PYME y período.
  - Exportable a CSV.
- [ ] T3.8 — Reporte cross-tenant en admin:
  - Total revenue-share del mes (suma de runs).
  - Top 10 tenants por share.
  - Tendencia 12 meses.
- [ ] T3.9 — Override manual desde admin: permitir ajustar un `revenue_share_runs` antes del lock con motivo obligatorio. Audit log lo registra.
- [ ] T3.10 — Tests:
  - Cálculo correcto con N PYMEs activas/inactivas, fees con `valid_from/valid_to` que cruzan el período.
  - Cambio de rate (`tenants.revenue_share_rate_*`) a mitad de mes → el run usa el valor vigente al momento del cierre, no el del inicio del período.
  - Tenant sin `tenant_fees` → run con totales 0.
  - Doble ejecución del cron es idempotente (unique key tenant+period).
- [ ] T3.11 — Documentación: `docs/multitenancy/revenue-share.md` con la fórmula, ventana de objeción, política de ajustes.

## Comandos

```bash
# Migración
cd apps/bff && pnpm drizzle-kit generate && pnpm drizzle-kit migrate

# Forzar cierre de un período (testing)
pnpm --filter @cuentax/bff exec tsx scripts/run-revenue-share.ts --period 2026-05

# Vista de un run (admin)
curl https://admin.cuentax.cl/api/admin/revenue-share/runs?period=2026-05 \
  -H "Authorization: Bearer $ADMIN_JWT"

# Tests
pnpm -w test --filter @cuentax/bff
```

## Criterios de aceptación

1. Un tenant con 5 PYMEs (3 contabilidad $80k c/u + 2 remuneraciones $50k c/u) genera un run con:
   - `total_contabilidad_clp = 240.000`
   - `total_remuneraciones_clp = 100.000`
   - `share_contabilidad_clp = 48.000` (20%)
   - `share_remuneraciones_clp = 20.000` (20%)
   - `total_share_clp = 68.000`
2. Ese mismo monto aparece como dos line items en el invoice del tenant del mes siguiente.
3. El contador ve la proyección en tiempo real al editar fees.
4. Override manual queda en audit log con motivo.
5. Tests verdes.

## Riesgos

- **Cambios retroactivos**: si el contador edita un fee del mes pasado, NO debe afectar runs `locked`. Solo afectan al período corriente o posterior.
- **Edición de rate por tenant**: los rates viven en `tenants` (defaults 20/20, editables desde admin). El rate aplicado al run es el vigente al momento del cierre (1° del mes siguiente) — quedan snapshot en `revenue_share_runs.rate_*`. Documentar.
- **PYMEs eliminadas**: si una `companies` se desactiva durante el mes, el fee aplica prorrateado (días activos/días del mes). Implementar en `calculator.ts` o documentar que NO se prorratea.
- **Ventana de objeción**: el cron de cobro (Fase 02) no debe correr antes de las 48h post-cierre. Coordinar timing.
- **Disputas**: tener un proceso documentado de cómo el contador puede pedir ajuste.
