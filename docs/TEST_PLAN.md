# CuentaX — Plan de Pruebas

Última actualización: 2026-04-21

Este documento define **qué** probamos, **cómo** lo probamos, y cuál es el
**criterio de aceptación** para cada feature del pipeline contable.

Convenciones:
- ✅ Automatizado (vitest o integración de prod)
- 🖐️ Manual recomendado antes de deploy
- 📋 Prerequisitos

---

## 1. Infraestructura

| Test | Tipo | Cómo verificar | Aceptación |
|---|---|---|---|
| BFF health | ✅ integ | `GET https://cuentaxapi.giraffos.com/health` | HTTP 200, `status:"ok"`, todos los circuitos `closed` |
| BFF deploy automático | ✅ integ | Push a `main` dispara deploy en Coolify | Deploy finaliza `status:"finished"` |
| Env vars críticas | 🖐️ | `curl` Coolify API `/envs` | `DATABASE_URL`, `JWT_SECRET`, `ODOO_URL`, `ODOO_PUBLIC_URL`, `FEATURE_USA_ACCOUNTING=true`, `FEATURE_AI_CLASSIFICATION=true` presentes |
| Redis conectado | ✅ integ | Health endpoint | `dependencies.redis:"ok"` |
| PostgreSQL conectado | ✅ integ | Health endpoint | `dependencies.postgresql:"ok"` |
| Odoo RPC alcanzable | ✅ integ | Health endpoint | Circuit `odoo_accounting:"closed"`, no `failures` |

---

## 2. Autenticación y multi-tenant

| Test | Tipo | Cómo verificar | Aceptación |
|---|---|---|---|
| Login CL | ✅ integ | `POST /auth/login` con credenciales CL | Retorna `access_token`, `user.country_code="CL"`, `currency:"CLP"` |
| Login cambia a empresa US | ✅ integ | `POST /companies/switch` con `company_id` US | JWT nuevo tiene `country_code:"US"`, `currency:"USD"` |
| JWT expirado retorna 401 | ✅ integ | Endpoint protegido con token viejo | HTTP 401 `token_expired` |
| Sin auth → 401 | ✅ integ | `GET /accounting/summary` sin header | HTTP 401 |
| Refresh token funciona | 🖐️ | `POST /auth/refresh` | Retorna nuevos tokens |

---

## 3. Guards por país

| Test | Tipo | Cómo verificar | Aceptación |
|---|---|---|---|
| CL company no puede usar `/usa/*` | ✅ integ | Con JWT CL, `GET /usa/summary` | HTTP 404 `not_available` |
| US company no puede usar `/sii/*` | ✅ integ | Con JWT US, `GET /sii/estado` | HTTP 404 `not_available` |
| `/accounting/*` accesible ambos países | ✅ integ | CL y US ambos responden | CL: CLP, US: USD en respuesta |
| Datos nunca cruzan empresa | 🖐️ | Login A, consulta B | `getLocalCompanyId` filtra por `odoo_company_id` |

---

## 4. Pipeline de importación (core)

### 4.1 Parsing

| Test | Tipo | Input | Aceptación |
|---|---|---|---|
| Chase CSV (US) | ✅ integ | CSV 637 líneas | 637 parseadas, 0 errores |
| BancoEstado CSV (CL) | ✅ integ | CSV 60 líneas con `;` | 60 parseadas, debit/credit en columnas separadas |
| OFX | 🖐️ | Archivo OFX válido | Extrae FITID, amount, date |
| Archivo vacío | ✅ integ | CSV solo con header | HTTP 400 `no_transactions` |
| Fechas mal formadas | ✅ integ | CSV con `99/99/9999` | Se omite con warning en `parse_errors` |

### 4.2 Hash / External ID

| Test | Tipo | Aceptación |
|---|---|---|
| Mismo input → mismo hash | ✅ unit (`transactionHash`) | Determinista, 32 char hex |
| Case-insensitive | ✅ unit | `stripe` == `STRIPE` |
| 1 centavo de diferencia → hash distinto | ✅ unit | Evita falsos dedupe |
| OFX usa FITID como ID natural | ✅ manual trace | `external_id` empieza con `ofx:` |

### 4.3 Deduplicación

| Test | Tipo | Aceptación |
|---|---|---|
| Re-import mismo CSV | ✅ integ | `inserted=0`, `skipped_duplicates=N` |
| Re-import con filas nuevas al final | 🖐️ | Solo las nuevas se insertan |
| 2 empresas con mismo CSV | 🖐️ | Cada una dedupea por su `bank_account_id` — no hay fuga cross-tenant |

### 4.4 Reconciliación

| Test | Tipo | Aceptación |
|---|---|---|
| Statement balanceado | ✅ unit + integ | `ok=true`, `diff≈0` |
| Statement con gap | ✅ unit + integ | `ok=false`, `diff > 0`, `note` con explicación |
| Tolerancia de 1 centavo | ✅ unit | Diff de 0.005 se considera ok |
| Endpoint `/reconcile` no persiste | ✅ integ | No crea rows en `bank_transactions` |

### 4.5 Detección de transfers

| Test | Tipo | Aceptación |
|---|---|---|
| Par exacto (EN) | ✅ unit | `TRANSFER TO SAVINGS -2000` + `TRANSFER FROM CHECKING +2000` → pair con confianza > 0.9 |
| Par exacto (ES) | ✅ unit | `TRANSFERENCIA A CUENTA AHORRO` + `ABONO A CUENTA PROPIA` → pair > 0.9 |
| Sin keyword, solo monto coincidente | ✅ unit | Confianza < 0.85 (weaker signal) |
| Fuera de ventana de 3 días | ✅ unit | No se pairea |
| No-doble-pareo | ✅ unit | Un negativo no puede pairearse con dos positivos |

### 4.6 Detección de refunds

| Test | Tipo | Aceptación |
|---|---|---|
| Vendor coincidente + keyword | ✅ unit | `AMAZON PURCHASE -150` + `AMAZON REFUND +150` → pair > 0.9 |
| Mismo vendor sin keyword | ✅ unit | `AMAZON -100` + `AMAZON +100` → pair 0.8 |
| Vendor distinto con keyword | ✅ unit | Confianza 0.55 |
| Fuera de ventana 60 días | ✅ unit | No se pairea |
| Keyword en español | ✅ unit | `DEVOLUCION`, `REVERSO`, `ANULACION` detectados |

---

## 5. Clasificación IA

| Test | Tipo | Aceptación | Notas |
|---|---|---|---|
| Prompt correcto por país | ✅ unit + 🖐️ | CL → SYSTEM_PROMPT_CL (español); US → en inglés | Manual: ver logs del request a Claude |
| Batching 30 tx/call | ✅ trace | 600 tx → 20 calls | Verificar en logs `batchStart` incrementa de 30 en 30 |
| Auto-aprueba confianza ≥ 0.8 | ✅ integ | `auto_approved` count > 0 | Stats endpoint |
| Needs review 0.5-0.8 | ✅ integ | `needs_review` count > 0 | Stats endpoint |
| Reglas aprendidas se aplican primero | ✅ integ | Aprobar clasificación corregida → siguiente import usa `source:"rule"` | Verificar en DB `classification_rules.hit_count > 0` |
| Transfers detectados se excluyen de IA | ✅ integ | Líneas marcadas transfer no aparecen en `classification.total` | Filter en route antes de llamar AI |
| Skip classify funciona sin API key | ✅ integ | `skip_classify:true` → persist+dedup+transfers sí, classify no | Útil antes de configurar ANTHROPIC_API_KEY |
| Sin API key, hook no corre | 📋 | Falta `ANTHROPIC_API_KEY` → clasificación lanza error silencioso | Actualmente bloqueado |
| Clasificador respeta chart of accounts | 🖐️ | Revisar `account_id` retornado existe en Odoo | Account lookup vía `a.code === c.account_code` |

---

## 6. Journal entries

| Test | Tipo | Aceptación |
|---|---|---|
| Crea asiento en Odoo | ✅ integ | Response contiene `odoo_move_id` no null |
| Double-entry balanceado | ✅ integ | `account.move.amount_total` = valor esperado; debit == credit por move |
| Ingreso: Dr Bank / Cr Revenue | 🖐️ | Revisar `account.move.line` para un STRIPE TRANSFER |
| Gasto: Dr Expense / Cr Bank | 🖐️ | Revisar líneas para un GUSTO PAYROLL |
| skip_transfers omite transferencias | ✅ integ | 12 transfers flagged → error "Skipped: transfer" |
| auto_post posterior de moves | ✅ integ | `posted:true` en response tras `action_post` batch |
| Batch posting 100 a la vez | ✅ trace | Logs muestran calls en grupos de 100 |
| Sin account_id y no-transfer → falla | ✅ integ | Error "no account assigned" |
| Re-run no duplica | ✅ integ | Segunda llamada → `created:0` (filtra por `odoo_move_id IS NULL`) |

---

## 7. Reportes

### 7.1 /summary (cash flow)

| Test | Tipo | Aceptación |
|---|---|---|
| Conteo exacto de transacciones | ✅ integ | Coincide con `SELECT COUNT(*) FROM bank_transactions` |
| Totales de deposits/payments | ✅ integ | Coinciden con suma agregada de `bank_transactions.monto` (÷100 para USD) |
| Breakdown mensual (12 meses) | ✅ integ | Array con `month`, `deposits`, `payments`, `net`, `count` |
| Top 10 vendors | ✅ integ | Ordenados por `total` descendente |
| Top 10 income sources | ✅ integ | Separado de vendors |
| Currency correcta | ✅ integ | USD para empresa US, CLP para CL |

### 7.2 /pnl (accrual P&L)

| Test | Tipo | Aceptación |
|---|---|---|
| Retorna revenue + expenses separados | ✅ integ | Cuentas 4xxx → revenue, 5xxx/6xxx/7xxx → expenses |
| Net Income = Revenue - Expenses | ✅ integ | Cálculo correcto del totales |
| Filtra por periodo | ✅ integ | `year=2025&month=4` limita al mes |
| Solo lee moves `state=posted` | ✅ integ | Draft moves no aparecen |

### 7.3 /pnl.pdf

| Test | Tipo | Aceptación |
|---|---|---|
| Retorna PDF válido | ✅ integ | `Content-Type: application/pdf`, `file` cmd detecta PDF v1.3+ |
| Header con empresa + RUT/EIN | 🖐️ | Abrir PDF y verificar header |
| Título en idioma correcto | 🖐️ | CL: "Estado de Resultados", US: "P&L Statement" |
| Net Income coloreado (verde/rojo) | 🖐️ | Verde si positivo, rojo si negativo |
| Footer con disclaimer | 🖐️ | "Generado automáticamente..." |

### 7.4 /vendor-spend.csv (1099-NEC)

| Test | Tipo | Aceptación |
|---|---|---|
| Retorna CSV descargable | ✅ integ | `Content-Type: text/csv`, `Content-Disposition: attachment` |
| US default threshold $600 | ✅ integ | Solo vendors con `total ≥ 600` |
| CL threshold 0 (todos) | ✅ integ | Todos los vendors incluidos |
| Columnas bilingües | 🖐️ | US: "Vendor, Year, Total Paid (USD)..."; CL: "Proveedor, Año..." |
| Nombres con coma escapados | ✅ | `"Smith, John"` con comilla doble interna escapada |

---

## 8. Multi-país específico

### 8.1 Chile

| Test | Tipo | Aceptación |
|---|---|---|
| Plan de Cuentas CL (72 cuentas) | 🖐️ | `POST /accounting/setup` con country=CL crea cuentas 1xxxx-7xxxx |
| Journal names en español | 🖐️ | "Ventas", "Compras", "Banco", "Caja", "Remuneraciones", "Asientos Varios" |
| Prompt IA en español | 🖐️ | Request a Claude contiene "contador chileno" |
| Moneda CLP (entero, sin decimales) | ✅ integ | bank_transactions.monto almacenado como pesos enteros |
| Detecta SII, Previred, Transbank | 🖐️ | Requiere API key — verificar clasificación |
| Respeta regulación deducibilidad | 📋 | Futuro: distinguir gastos con/sin factura |

### 8.2 USA

| Test | Tipo | Aceptación |
|---|---|---|
| US GAAP chart (67 cuentas) | 🖐️ | `/accounting/setup` con country=US crea 1000-7200 |
| Journal names en inglés | 🖐️ | Sales, Purchases, Bank, Cash, Miscellaneous |
| Prompt IA en inglés | 🖐️ | Request a Claude contiene "US small business bookkeeper" |
| Moneda USD (cents) | ✅ integ | bank_transactions.monto = dollars × 100 |
| Reconoce STRIPE, GUSTO, AWS | 🖐️ | Con API key, >80% confianza en vendors conocidos |
| 1099 threshold automático | ✅ integ | Default $600 para país US |

---

## 9. Integridad de datos

| Test | Tipo | Aceptación |
|---|---|---|
| external_id único por bank_account | 🖐️ SQL | `SELECT COUNT(*) FROM bank_transactions GROUP BY bank_account_id, external_id HAVING COUNT(*) > 1` → 0 filas |
| No amounts < $10 (sanity check) | 🖐️ SQL | `SELECT COUNT(*) FROM bank_transactions WHERE ABS(monto) < 1000 AND company_id IN (...)` → 0 (o explicable) |
| classified_account_id válido en Odoo | 🖐️ | Cross-check con `account.account` |
| FK integrity (classifications → bank_transactions) | ✅ schema | Constraint definido en schema |
| Moves referencian classifications | ✅ SQL | `SELECT COUNT(*) FROM transaction_classifications WHERE odoo_move_id IS NOT NULL` coincide con `account.move` count filtrado |

---

## 10. Performance

| Test | Tipo | Aceptación |
|---|---|---|
| 637 tx parse | ✅ perf | < 2s |
| 637 tx persist (dedup) | ✅ perf | < 10s |
| 637 tx re-import (todos skipped) | ✅ perf | < 5s |
| 468 moves create en Odoo | ✅ perf | < 4 min (≈ 500ms/move) |
| 468 moves batch post (100x) | ✅ perf | < 30s (vs 8 min de 1-por-1) |
| PDF generation | ✅ perf | < 1s |
| Summary query 10k tx | 🖐️ | Índices en `company_id`, `fecha` → < 500ms |

---

## 11. Unit tests (vitest)

Ejecutar: `cd apps/bff && pnpm test`

Cobertura actual: **44 tests, 3 archivos**

### `core.test.ts` (24 tests)
- Validación RUT
- Validación EIN
- Formatters CLP/USD
- Utilidades de fecha

### `bank-reconciliation.test.ts` (19 tests)
- `transactionHash` (4 tests): determinismo, case-insensitive, diferencia por monto/ref
- `reconcileBalances` (3 tests): balanced, gap, tolerancia
- `detectTransfers` (5 tests): EN pair, ES pair, sin keyword, fuera ventana, no doble
- `detectRefunds` (4 tests): vendor match, ES devolución, diff vendor, fuera ventana
- `normalizeVendor` (3 tests): strip dates, uppercase, fallback

### `ai-classification-country.test.ts` (1 test)
- Verifica signature de `classifyTransactions` acepta country

---

## 12. Checklist de pre-deploy

Antes de cualquier merge a `main` que toque el pipeline:

- [ ] `pnpm typecheck` en bff y web sin errores
- [ ] `pnpm test` en bff pasa (44/44)
- [ ] `pnpm build` en web construye sin warnings nuevos
- [ ] Endpoints manuales verificados:
  - [ ] `POST /accounting/reconcile` con CSV válido
  - [ ] `GET /accounting/summary?year=YYYY` retorna datos
  - [ ] `GET /accounting/pnl.pdf?year=YYYY` descarga PDF
- [ ] Logs del BFF sin nuevos errors inesperados
- [ ] Smoke test end-to-end: login → switch → import → classify → entries → pnl

---

## 13. Plan de pruebas manual completo (1 año de data)

**Prerequisitos**:
- Empresa US en Odoo (país 233 United States)
- Codes seteados en al menos: Bank (1000), Revenue (4000), Payroll (6000), Software (6100)
- `ANTHROPIC_API_KEY` en Coolify (opcional pero recomendado)
- CSV de Chase/BofA con ≥ 1 año de transacciones

**Pasos**:
1. **Setup** — `POST /accounting/setup` → verificar 67 accounts + 5 journals
2. **Pre-flight** — `POST /accounting/reconcile` con opening + closing del statement → `ok:true`
3. **Import** — `POST /accounting/import-and-classify` con el CSV → verificar stats
4. **Review** — `GET /accounting/classifications?status=pending` → aprobar/corregir manualmente
5. **Learn** — Corregir 1-2 clasificaciones con cuenta diferente → verificar `classification_rules` creada
6. **Re-import same** — debe skippear todas (dedup idempotente)
7. **Generate entries** — `POST /accounting/generate-entries` con `auto_post:true`
8. **P&L** — `GET /accounting/pnl?year=YYYY` → verificar totales cuadran con bank summary
9. **PDF** — `GET /accounting/pnl.pdf?year=YYYY` → PDF legible, totales correctos
10. **1099** — `GET /accounting/vendor-spend.csv?year=YYYY&threshold=600` → vendors ≥ $600
11. **AI chat** — hacer preguntas en español (CL) / inglés (US) → respuestas coherentes

---

## 16. Módulo de Centros de Costo (analytic dimensions)

Feature genérica que funciona para cualquier cliente: propiedades (Airbnb),
proyectos (construcción), casos (law firm), locales (retail), departamentos, etc.
Backed by Odoo's `account.analytic.account` + `account.analytic.plan`.

### 16.1 Schema

| Test | Tipo | Aceptación |
|---|---|---|
| Migration 0004 applied | 🖐️ | `cost_centers` table + FK `cost_center_id` on `transaction_classifications` |
| Prerequisite: admin user has group "Analytic Accounting" (id=16) | 🖐️ | `res.users.groups_id` contains 16 — otherwise Odoo rejects creates with permission error |

### 16.2 CRUD

| Test | Tipo | Aceptación |
|---|---|---|
| POST /accounting/cost-centers creates in Odoo + local | ✅ integ | Returns row with `odoo_analytic_id` populated |
| Create with plan_name creates analytic.plan if missing | ✅ integ | Plan reusable across centers |
| GET /accounting/cost-centers | ✅ integ | Returns only active centers for current company |
| PUT /accounting/cost-centers/:id updates keywords | ✅ integ | Round-trip visible in subsequent GET |
| DELETE deactivates (soft) | ✅ integ | `active=false`, existing classifications keep tag |
| POST /cost-centers/sync pulls unknown analytic accounts from Odoo | ✅ integ | Bulk-imports existing analytic data |

### 16.3 Keyword matching

| Test | Tipo | Aceptación |
|---|---|---|
| `matchCostCenterByKeywords` case-insensitive substring | ✅ unit | 5 tests cover match, miss, tie-break, empty, no keywords |
| Longest keyword wins tie | ✅ unit | "PROV 101" beats "PROV" |
| Auto-tag endpoint retroactively tags | ✅ integ | POST /cost-centers/auto-tag updates untagged classifications |
| Real-data validation | ✅ manual | 4/5 seed transactions tagged correctly; "TRANSBANK" stays untagged (expected) |

### 16.4 Airbnb parser

| Test | Tipo | Aceptación |
|---|---|---|
| EN headers (Date, Type, Listing, Amount, Host Fee, ...) | ✅ unit | Parses correctly |
| ES headers (Fecha, Tipo, Anuncio, Monto, Comisión del anfitrión) | ✅ unit | Parses correctly |
| Skips Payout rows (only keeps Reservation) | ✅ unit | `unsupported_rows` counted separately |
| Extracts unique listings with counts + totals | ✅ unit | Sorted by total gross |
| Computes end_date from start + nights | ✅ unit | ISO string |
| Detects date range | ✅ unit | min/max of reservation_date |
| Matches listings to cost_center.airbnb_listing | ✅ integ | 3/3 listings mapped when airbnb_listing set |
| Suggests by partial name match | ✅ integ | `suggested_cost_center_id` when no exact match |

### 16.5 Journal entries with analytic distribution

| Test | Tipo | Aceptación |
|---|---|---|
| Classification with cost_center_id → move line has `analytic_distribution` | ✅ integ | Shape: `{"<odoo_analytic_id>": 100}` |
| Bank line does NOT carry analytic distribution | ✅ design | Only expense/income line |
| Move post preserves analytic_distribution | ✅ integ | Visible on `account.move.line` after post |

### 16.6 P&L reports

| Test | Tipo | Aceptación |
|---|---|---|
| GET /accounting/cost-center-pnl?year=YYYY | ✅ integ | Returns `by_center[]` + totals |
| Buckets by analytic_distribution keys | ✅ design | Splits multi-plan shares correctly |
| Untagged lines go to `(sin centro)` bucket | ✅ integ | Special bucket `cost_center_id: null` |
| Sorted by net_income descending | ✅ integ | |
| GET /accounting/cost-center-pnl.pdf | ✅ integ | Multi-page PDF: summary + one page per center |
| Bilingual PDF (CL: Estado de Resultados, US: P&L) | ✅ design | |

### 16.7 Frontend pages

| Page | Reachable | Funcionalidad |
|---|---|---|
| /dashboard/accounting/cost-centers | ✅ HTTP 200 | CRUD, keywords, search, sync, auto-tag |
| /dashboard/accounting/cost-center-pnl | ✅ HTTP 200 | Year/month picker, expandable per-center, PDF |
| /dashboard/accounting/airbnb | ✅ HTTP 200 | CSV upload, listings mapping, create-center inline |
| Nav: "Centros de Costo" en CL | ✅ | Bajo sección "Contabilidad IA" |
| Nav: "Cost Centers" en US | ✅ | Bajo sección "Accounting" |

### 16.8 Unit tests

```
src/__tests__/cost-center.test.ts — 12 tests:
  matchCostCenterByKeywords (5 tests)
  parseAirbnbCsv (7 tests)
```

Total del test suite: **56 tests pasando**.

---

## 14. Bugs conocidos (no bloqueantes)

| Bug | Impacto | Estado |
|---|---|---|
| ~~Odoo 18: `account.account.code` no persiste desde red Docker del BFF~~ | ~~Display de códigos faltante~~ | ✅ **RESUELTO** en commit `9fd5acc` — ver §15 |
| Frontend: form de crear empresa sólo CL (no EIN) | No se pueden crear empresas US desde UI | Workaround: crear vía `POST /api/v1/companies` con curl |
| Moves post secuencial para 500+ → ~8 min | Lentitud | ✅ **RESUELTO** — batch de 100 con `auto_post:true` (~30s) |

---

## 15. Solución al bug de Odoo 18 codes (referencia)

**Problema original**: Al crear `account.account` en Odoo 18, el campo `code`
es **company-dependent** (backend: `account.code.mapping`). El write vía RPC
retornaba `true` pero no persistía cuando se hacía desde la red Docker
interna del BFF — aun pasando `context: {company_id: X}`.

**Causa raíz**: En Odoo 18 el ORM resuelve `env.company` desde el
`res.users.company_id` del usuario autenticado, NO del context del request.
Cuando el admin tiene default `company_id=1` y escribimos en accounts de
`company_id=7`, el mapping se termina escribiendo bajo company 1 (o no
se escribe), no bajo company 7.

**Solución**:
1. Antes de escribir codes, cambiar temporalmente el `res.users.company_id`
   del admin al target company (`withAdminDefaultCompany`)
2. Las RPC calls para ese user-swap y los writes subsiguientes deben ir por
   la URL pública de Odoo (`ODOO_PUBLIC_URL`), no la interna
3. Restaurar el `company_id` original en finally (siempre)

**Implementación**: `OdooAccountingAdapter.withAdminDefaultCompany()` +
`writePublic()` en `apps/bff/src/adapters/odoo-accounting.adapter.ts`.

**Verificado**: `POST /accounting/setup` sobre empresa fresh genera 67
accounts (US) o 72 (CL) con 100% de codes persistidos, visible a cualquier
usuario que tenga esa empresa como default.
