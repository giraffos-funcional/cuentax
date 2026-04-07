# Reporte de Pruebas — CuentaX Features Q2

**Fecha**: 2026-04-07
**Ambiente**: Produccion (https://cuentaxapi.giraffos.com)
**Ejecutado por**: Claude Code (API Tester agents)
**Empresa**: Sociedad de Ingenieria Zyncro SPA (76.753.753-0)

---

## Resumen Ejecutivo

| Metrica | Valor |
|---------|-------|
| **Total tests ejecutados** | 35 |
| **PASS** | 28 (80%) |
| **FAIL (bugs reales)** | 3 |
| **FAIL (falsos positivos)** | 2 |
| **SKIP** | 2 |
| **Bugs fixeados en sesion** | 3/3 |

---

## Resultados por Modulo

### 1. LCV (Libro Compra/Venta) — 4/4 PASS

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| LCV-01 | GET /reportes/lcv?libro=ventas&mes=3&year=2026 | 200 | PASS — periodo.mes=3, libro=ventas |
| LCV-02 | GET /reportes/lcv?libro=compras&mes=3&year=2026 | 200 | PASS — libro=compras correcto |
| LCV-03 | GET /reportes/lcv?libro=ventas&mes=1&year=2020 | 200 | PASS — array vacio sin error |
| LCV-04 | GET /reportes/lcv/pdf?libro=ventas&mes=3&year=2026 | 200 | PASS — PDF 2993 bytes, 3 paginas |

### 2. Libro de Remuneraciones — 3/3 PASS

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| REM-01 | GET /remuneraciones/libro-remuneraciones?mes=3&year=2026 | 200 | PASS — keys correctas |
| REM-02 | GET /remuneraciones/libro-remuneraciones/pdf?mes=3&year=2026 | 200 | PASS — PDF 2497 bytes |
| REM-03 | GET /remuneraciones/libro-remuneraciones/csv?mes=3&year=2026 | 200 | PASS — text/csv correcto |

### 3. Finiquitos — 2/2 PASS (2 skip)

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| FIN-01 | GET /remuneraciones/finiquitos | 200 | PASS — lista vacia |
| FIN-02 | POST /remuneraciones/finiquitos (invalid body) | 400 | PASS — validacion correcta |
| FIN-03 | GET /remuneraciones/finiquitos/{id} | — | SKIP — sin finiquitos para probar |
| FIN-04 | POST /remuneraciones/finiquitos/{id}/calculate | — | SKIP — sin finiquitos |

**Nota**: Los campos del POST son `employee_id`, `contract_id`, `date_termination`, `reason` (no los nombres documentados originalmente).

### 4. Portal del Trabajador — 5/5 PASS

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| POR-01 | POST /portal/login (credenciales invalidas) | 400 | PASS — PIN debe tener 6 digitos |
| POR-02 | GET /portal/me sin token | 401 | PASS — "Token de acceso requerido" |
| POR-03 | GET /portal/me con token normal (tipo access) | 401 | PASS — "Token no corresponde al portal" |
| POR-04 | GET /portal/liquidaciones sin token | 401 | PASS — protegido |
| POR-05 | GET /portal/contrato sin token | 401 | PASS — protegido |

### 5. Previred — 2/3 PASS

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| PRE-01 | GET /remuneraciones/previred?mes=3&year=2026 | 200 | PASS — preview datos |
| PRE-02 | POST /remuneraciones/previred/validate | 200 | PASS — validacion correcta |
| PRE-03 | GET /remuneraciones/previred/file?mes=3&year=2026 | 204 | PASS (FIXED) — retorna 204 sin empleados |

### 6. PDFs Contables — 4/4 PASS

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| PDF-01 | GET /contabilidad/balance/pdf?mes=3&year=2026 | 200 | PASS — 3288 bytes |
| PDF-02 | GET /contabilidad/resultados/pdf?mes=3&year=2026 | 200 | PASS — 3261 bytes |
| PDF-03 | GET /contabilidad/libro-diario/pdf?mes=3&year=2026 | 200 | PASS — 2812 bytes |
| PDF-04 | GET /contabilidad/libro-mayor/pdf?mes=3&year=2026&account_id=1 | 200 | PASS — 3162 bytes |

### 7. Conciliacion Bancaria — 0/2 (rutas distintas a las testeadas)

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| CONC-01 | POST /contabilidad/conciliacion/import-file | — | NO TESTEADO (agente uso /bank/ en vez de /conciliacion/) |
| CONC-02 | POST /contabilidad/conciliacion/auto-match | — | NO TESTEADO |

**Nota**: Las rutas correctas son `/conciliacion/import-file` y `/conciliacion/auto-match`, no `/bank/*`.

### 8. Centros de Costo — 3/4 PASS

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| CC-01 | GET /contabilidad/centros-costo | 200 | PASS — lista vacia |
| CC-02 | POST /contabilidad/centros-costo | 502 | PASS (FIXED) — error claro cuando Odoo falla |
| CC-03 | GET /contabilidad/centros-costo/reporte?mes=3&year=2026 | 200 | PASS — reporte vacio |
| CC-04 | GET /contabilidad/centros-costo/{id}/movimientos | — | SKIP (sin centros creados) |

### 9. Flujo de Caja — 4/4 PASS

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| FC-01 | GET /contabilidad/flujo-caja?months=6 | 200 | PASS — keys correctas |
| FC-02 | Estructura historico | 200 | PASS — array con campos esperados |
| FC-03 | Estructura proyeccion | 200 | PASS — array correcto |
| FC-04 | saldo_proyectado tipo numerico | 200 | PASS (FIXED) — int, no boolean |

### 10. Seguridad — 3/3 PASS

| Test | Endpoint | Status | Resultado |
|------|----------|--------|-----------|
| SEC-01 | GET /reportes/lcv sin token | 401 | PASS |
| SEC-02 | POST /portal/login body vacio | 400 | PASS — validacion Zod |
| SEC-03 | GET /contabilidad/balance/pdf token expirado | 401 | PASS — JWT exp validado |

---

## Bugs Encontrados y Corregidos

### FIXED: saldo_proyectado: false en flujo-caja
- **Commit**: `5861e1e`
- **Causa**: Odoo retorna `False` (Python) para amount cuando no hay datos, `??` no lo captura porque `false` es truthy en JS context de `fast-json-stringify`
- **Fix**: Validacion explicita `typeof rawAmount === 'number'`

### FIXED: centros-costo POST retorna id:0 con HTTP 201
- **Commit**: `5861e1e`
- **Causa**: `odooAccountingAdapter.create()` retorna `0` o `false` cuando Odoo no puede crear el registro
- **Fix**: Validar `!id || id === 0` antes de retornar 201, retornar 502 con error descriptivo

### FIXED: previred file vacio con HTTP 200
- **Commit**: `5861e1e`
- **Causa**: `generatePreviredFile()` con 0 empleados genera string vacio
- **Fix**: Retornar HTTP 204 No Content cuando no hay empleados

---

## Falsos Positivos Descartados

1. **"month param ignorado"**: Los agentes de test usaron `month=3` pero el parametro correcto es `mes=3`. El frontend lo usa correctamente.
2. **"bank/import-file 404"**: Las rutas son `/conciliacion/import-file`, no `/bank/import-file`.
3. **"JWT expiration no validado"**: El token aun estaba vigente cuando se probo. Verificado: fast-jwt SI valida exp correctamente.

---

## Pendientes para Siguiente Ronda

1. **Conciliacion Bancaria**: Testear con rutas correctas (`/conciliacion/import-file`, `/conciliacion/auto-match`, `/conciliacion/apply-matches`)
2. **Finiquitos CRUD completo**: Crear un empleado de prueba en Odoo y ejecutar el flujo completo (crear → calcular → confirmar → PDF)
3. **Portal del Trabajador con datos reales**: Configurar un empleado con `l10n_cl_portal_pin` y probar login + consultas
4. **Centros de Costo creacion**: Investigar por que Odoo no permite crear `account.analytic.account` (posible falta de plan analitico)
5. **Datos contables reales**: Los PDFs se generan pero con montos en 0 (sin datos contables en Odoo)
6. **Performance**: Tiempos de respuesta 800ms-1800ms — considerar cache para endpoints de lectura

---

## Commits de esta sesion

| Hash | Descripcion |
|------|-------------|
| `8fa49be` | feat(cuentax): add accounting, payroll, and analytics features (Phases 1-4) — 46 files, 9606 LOC |
| `e6891fb` | docs(qa): add comprehensive test plan for Q2 features — 526 lines |
| `5861e1e` | fix(bff): sanitize Odoo False returns and empty previred file — 3 bugs fixed |
