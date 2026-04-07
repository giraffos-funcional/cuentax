# Plan de Pruebas - CuentaX Features Q2 2026

**Fecha:** 7 de Abril 2026
**Version:** 1.0
**Responsable QA:** Equipo CuentaX / El Colectivo
**Ambiente:** Staging (Odoo 18 + BFF Fastify + Frontend Next.js)

---

## Indice

1. [Datos de Prueba Sugeridos](#datos-de-prueba-sugeridos)
2. [Modulo 1: Libro Compra/Venta (LCV)](#modulo-1-libro-compraventa-lcv)
3. [Modulo 2: Libro de Remuneraciones](#modulo-2-libro-de-remuneraciones)
4. [Modulo 3: Finiquitos](#modulo-3-finiquitos)
5. [Modulo 4: Portal del Trabajador](#modulo-4-portal-del-trabajador)
6. [Modulo 5: Archivo Previred](#modulo-5-archivo-previred)
7. [Modulo 6: PDFs Contables](#modulo-6-pdfs-contables)
8. [Modulo 7: Conciliacion Bancaria Mejorada](#modulo-7-conciliacion-bancaria-mejorada)
9. [Modulo 8: Centros de Costo](#modulo-8-centros-de-costo)
10. [Modulo 9: Flujo de Caja](#modulo-9-flujo-de-caja)
11. [Pruebas de Integracion Odoo](#pruebas-de-integracion-odoo)
12. [Pruebas de Edge Cases y Errores](#pruebas-de-edge-cases-y-errores)
13. [Pruebas de UI/UX](#pruebas-de-uiux)
14. [Checklist Smoke Test Rapido](#checklist-smoke-test-rapido)

---

## Datos de Prueba Sugeridos

### Empresa de Prueba
- **Razon Social:** Pruebas SpA
- **RUT:** 76.123.456-7
- **Giro:** Servicios de Tecnologia
- **Direccion:** Av. Providencia 1234, Santiago
- **UF Referencia:** $38.500 (usar valor actualizado del periodo)

### Empleados de Prueba

| Nombre | RUT | Cargo | Sueldo Base | AFP | Salud | Contrato |
|--------|-----|-------|-------------|-----|-------|----------|
| Juan Perez | 12.345.678-9 | Desarrollador Senior | $2.500.000 | Habitat (33) | Fonasa (07) | Indefinido |
| Maria Lopez | 11.222.333-4 | Contadora | $1.800.000 | Cuprum (05) | Banmedica (67) Plan 3.5 UF | Indefinido |
| Pedro Gonzalez | 15.666.777-8 | Junior Dev | $600.000 | Modelo (08) | Fonasa (07) | Plazo Fijo |
| Ana Torres | 10.111.222-K | Gerente | $4.500.000 | ProVida (33) | Colmena (71) Plan 5.0 UF | Indefinido |
| Carlos Muhoz | 16.888.999-0 | Practicante | $460.000 (IMM) | Capital (08) | Fonasa (07) | Obra/Faena |

### Indicadores del Periodo
- UF: $38.500
- UTM: $66.362
- Sueldo Minimo (IMM): $460.000
- Tope Imponible AFP: 81.6 UF
- Tope Imponible IPS: 60 UF

### Bancos para Import
- BancoEstado (CSV separado por ;)
- BCI (CSV separado por ;)
- Santander (CSV separado por ,)
- Archivo OFX generico

---

## Modulo 1: Libro Compra/Venta (LCV)

### 1.1 Consulta LCV - Datos

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| LCV-001 | Consultar LCV de Ventas periodo actual | Odoo conectado con facturas emitidas | 1. Ir a Reportes > LCV 2. Seleccionar "Ventas" 3. Seleccionar mes y anho actual | Se muestran registros de ventas con tipo DTE (33, 39, 41, 56, 61), folio, fecha, RUT receptor, razon social, neto, IVA y total. Source = "odoo" | P0 |
| LCV-002 | Consultar LCV de Compras | Odoo conectado con facturas de proveedor | 1. Seleccionar "Compras" 2. Consultar periodo con compras | Se muestran todas las facturas de compra. Totales neto/IVA/total calculados correctamente | P0 |
| LCV-003 | LCV fallback a datos locales | Odoo no disponible o sin datos | 1. Desconectar Odoo (o periodo sin datos Odoo) 2. Consultar LCV | Se muestran datos desde DTEs locales. Source = "local". Los tipos DTE se filtran correctamente para ventas (33, 39, 41, 56, 61) | P1 |
| LCV-004 | Totales LCV cuadran | Registros disponibles en LCV | 1. Sumar manualmente neto, IVA y total de registros 2. Comparar con totales mostrados | Los totales de neto, IVA y total coinciden con la suma de registros individuales | P0 |
| LCV-005 | LCV periodo sin datos | Sin facturas en el periodo | 1. Consultar un mes sin movimientos | Tabla vacia, totales en 0, sin errores. Mensaje informativo | P2 |
| LCV-006 | LCV con paginacion | Mas de 500 registros en un periodo | 1. Consultar un periodo con +500 facturas | Se respeta el limite de 500 registros. Indicar si hay mas registros disponibles | P2 |

### 1.2 LCV PDF

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| LCV-010 | Generar PDF de LCV Ventas | Datos LCV disponibles | 1. Consultar LCV Ventas 2. Click "Descargar PDF" | Se descarga PDF con: nombre empresa, RUT, periodo, tabla de registros, totales. Nombre archivo: LCV_ventas_YYYY_MM.pdf | P0 |
| LCV-011 | Generar PDF de LCV Compras | Datos LCV Compras disponibles | 1. Consultar LCV Compras 2. Click "Descargar PDF" | PDF generado correctamente con datos de compras | P1 |
| LCV-012 | PDF LCV con fallback local | Odoo no disponible | 1. Con Odoo caido, generar PDF | PDF se genera con datos locales. Campos se mapean correctamente (tipo_dte, folio, fecha, rut_receptor, etc.) | P1 |
| LCV-013 | PDF LCV periodo vacio | Sin datos para el periodo | 1. Generar PDF de periodo vacio | PDF se genera con tabla vacia y totales en 0, sin error | P3 |

---

## Modulo 2: Libro de Remuneraciones

### 2.1 Consulta Libro de Remuneraciones

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| REM-001 | Consultar libro de remuneraciones | Liquidaciones confirmadas (state=done) en el periodo | 1. Ir a Remuneraciones > Libro 2. Seleccionar periodo | Tabla con columnas: RUT, Nombre, Departamento, Dias, Sueldo Base, Gratificacion, Otros Haberes, Total Hab. Imp., Total Hab. No Imp., AFP, Salud, Cesantia, Impuesto, Total Desc., Liquido. Fila de totales al final | P0 |
| REM-002 | Verificar desglose por empleado | Al menos 3 empleados con liquidaciones | 1. Consultar libro 2. Verificar cada fila | Cada empleado muestra: RUT correcto, sueldo base (codigo BASIC), gratificacion (codigo GRAT), colacion+movilizacion como no imponible, descuentos legales separados | P0 |
| REM-003 | Verificar totales del libro | Libro con multiples empleados | 1. Sumar columnas manualmente 2. Comparar con fila de totales | Todos los totales (sueldo base, AFP, salud, cesantia, impuesto, liquido) cuadran con la suma de filas individuales | P0 |
| REM-004 | Libro sin liquidaciones en periodo | Periodo sin nominas cerradas | 1. Consultar periodo sin datos | Tabla vacia, totales en 0, total_empleados = 0 | P2 |

### 2.2 Libro de Remuneraciones - Exportacion

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| REM-010 | Descargar PDF libro remuneraciones | Datos disponibles | 1. Click "Descargar PDF" | PDF con: empresa, RUT empresa, periodo, tabla completa, totales. Nombre: LibroRemuneraciones_YYYY_MM.pdf | P0 |
| REM-011 | Descargar CSV libro remuneraciones | Datos disponibles | 1. Click "Descargar CSV" | CSV con headers: N, RUT, Nombre, Departamento, Dias, Sueldo Base, ..., Liquido. Separado por comas. Codificacion UTF-8 | P1 |
| REM-012 | CSV abre correctamente en Excel | CSV descargado | 1. Abrir CSV en Excel/LibreOffice 2. Verificar que columnas se alinean correctamente | Datos en columnas correctas. Numeros sin problemas de formato. Caracteres especiales (nh, tildes) se muestran bien | P1 |

---

## Modulo 3: Finiquitos

### 3.1 CRUD Finiquitos

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| FIN-001 | Crear finiquito - Necesidades Empresa | Empleado con contrato activo, +3 anhos antiguedad | 1. Ir a Remuneraciones > Finiquitos 2. Click "Nuevo" 3. Seleccionar empleado, contrato, fecha, causal "Necesidades de la Empresa (Art. 161)" 4. Guardar | Finiquito creado en estado "Borrador". Se genera referencia secuencial. Datos del contrato cargados automaticamente (fecha inicio, sueldo) | P0 |
| FIN-002 | Crear finiquito - Renuncia Voluntaria | Empleado con contrato activo | 1. Crear finiquito con causal "Renuncia Voluntaria (Art. 159 N2)" | Finiquito creado. Indemnizacion por anhos = $0 (no aplica para renuncia) | P0 |
| FIN-003 | Crear finiquito - Mutuo Acuerdo | Empleado con contrato activo | 1. Crear finiquito con causal "Mutuo Acuerdo (Art. 159 N1)" | Finiquito creado. Indemnizacion por anhos SI se calcula (aplica para mutuo acuerdo) | P1 |
| FIN-004 | Crear finiquito - Art. 160 | Empleado con contrato activo | 1. Crear finiquito con causal "Despido Justificado (Art. 160)" | Finiquito creado. Indemnizacion por anhos = $0 (no aplica para Art. 160) | P1 |
| FIN-005 | Crear finiquito - Vencimiento Plazo | Empleado con contrato plazo fijo | 1. Crear finiquito con causal "Vencimiento del Plazo (Art. 159 N4)" | Finiquito creado correctamente | P2 |
| FIN-006 | Listar finiquitos | Varios finiquitos creados | 1. Ir a lista de finiquitos | Lista paginada con: referencia, empleado, fecha, causal, estado, total. Ordenados por fecha descendente | P1 |
| FIN-007 | Ver detalle finiquito | Finiquito existente | 1. Click en un finiquito | Detalle completo: datos empresa, empleado, contrato, fechas, causal, desglose de montos | P1 |
| FIN-008 | Validacion campos requeridos | Formulario vacio | 1. Intentar crear finiquito sin employee_id, contract_id, date_termination o reason | Error 400 con mensaje "Campos requeridos: employee_id, contract_id, date_termination, reason" | P0 |

### 3.2 Calculos Legales Finiquito

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| FIN-020 | Calcular indemnizacion por anhos de servicio | Finiquito borrador, causal=necesidades_empresa, empleado con 5 anhos, sueldo $2.500.000 | 1. Click "Calcular" | **Indemnizacion = promedio 3 meses * 5 anhos** (tope 11 anhos). Si avg_wage_3m = $2.500.000 => indemnizacion = $12.500.000. Estado cambia a "Calculado" | P0 |
| FIN-021 | Tope 11 anhos de indemnizacion | Empleado con 15 anhos de antiguedad, causal necesidades_empresa | 1. Calcular finiquito | Indemnizacion por anhos usa tope de 11 anhos (floor(years) capped at 11), no 15 | P0 |
| FIN-022 | Tope 90 UF mensual | Empleado con sueldo $5.000.000 (supera 90 UF), valor UF ingresado | 1. Ingresar valor UF (ej: $38.500) 2. Calcular | La base mensual para indemnizacion no supera 90 * UF = $3.465.000. Indemnizacion calculada con este tope | P0 |
| FIN-023 | Vacaciones proporcionales | Empleado trabajo 90 dias en el anho actual | 1. Calcular finiquito | Vacaciones proporcionales = (dias_en_anho / 365) * 15 * (sueldo_diario). Sueldo diario = avg_wage_3m / 30 | P0 |
| FIN-024 | Feriado legal pendiente | Empleado con 5 dias de vacaciones sin usar | 1. Crear asignacion de vacaciones 2. Calcular finiquito | Feriado pendiente = dias_restantes * sueldo_diario. Verifica que se restan los dias ya tomados | P1 |
| FIN-025 | Sueldo proporcional | Finiquito al dia 15 del mes, sueldo $1.800.000 | 1. Fecha terminacion = dia 15 2. Calcular | Sueldo proporcional = (15 / 30) * $1.800.000 = $900.000 | P0 |
| FIN-026 | Gratificacion proporcional | Empleado con 4 meses en el anho | 1. Calcular finiquito | Gratificacion proporcional = min(sueldo*12*0.25/12, 4.75*IMM/12) * meses_anho_actual. Tope Art. 50: 4.75 * $460.000 / 12 = ~$182.083/mes | P1 |
| FIN-027 | Total finiquito cuadra | Finiquito calculado | 1. Sumar todos los conceptos 2. Comparar con total | Total = indemnizacion + vacaciones_prop + feriado_pendiente + sueldo_prop + gratificacion_prop | P0 |
| FIN-028 | Promedio 3 meses desde liquidaciones | Empleado con 3 liquidaciones confirmadas | 1. Calcular finiquito | avg_wage_3m = promedio de gross_wage de las 3 ultimas liquidaciones confirmadas. Si no hay liquidaciones, usa sueldo contractual | P1 |

### 3.3 Flujo de Estados Finiquito

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| FIN-030 | Flujo: Borrador -> Calculado -> Confirmado -> Firmado | Finiquito nuevo | 1. Crear (Borrador) 2. Calcular (Calculado) 3. Confirmar (Confirmado) 4. Firmar (Firmado) | Cada transicion exitosa. Al confirmar, el contrato se cierra (state=close, date_end=fecha_terminacion) | P0 |
| FIN-031 | No se puede calcular si no esta en Borrador | Finiquito en estado Calculado | 1. Intentar calcular de nuevo | Error: "Solo se puede calcular un finiquito en estado Borrador" | P1 |
| FIN-032 | No se puede confirmar sin calcular | Finiquito en estado Borrador | 1. Intentar confirmar | Error: "Debe calcular el finiquito antes de confirmar" | P1 |
| FIN-033 | No se puede firmar sin confirmar | Finiquito en estado Calculado | 1. Intentar firmar | Error: "Debe confirmar el finiquito antes de firmar" | P1 |
| FIN-034 | No se puede revertir finiquito firmado | Finiquito en estado Firmado | 1. Intentar volver a borrador | Error: "No se puede revertir un finiquito firmado" | P1 |
| FIN-035 | Reset a borrador desde Calculado | Finiquito Calculado | 1. Volver a borrador | Estado cambia a Borrador. Se puede recalcular | P2 |

### 3.4 PDF Finiquito

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| FIN-040 | Generar PDF finiquito | Finiquito calculado o confirmado | 1. Click "Descargar PDF" | PDF con: datos empresa, datos empleado (RUT, cargo, depto), fechas contrato, causal con articulo legal, desglose montos, total. Formato legal | P0 |
| FIN-041 | PDF incluye todos los conceptos | Finiquito con indemnizacion | 1. Verificar PDF | PDF muestra: indemnizacion anhos, vacaciones proporcionales, feriado pendiente, sueldo proporcional, gratificacion proporcional, total | P0 |
| FIN-042 | PDF finiquito renuncia sin indemnizacion | Finiquito por renuncia | 1. Generar PDF | Indemnizacion por anhos no aparece o muestra $0 | P1 |

---

## Modulo 4: Portal del Trabajador

### 4.1 Autenticacion Portal

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PTL-001 | Login exitoso con RUT + PIN | Empleado con PIN de 6 digitos configurado en Odoo (l10n_cl_portal_pin) | 1. Ir a /portal/login 2. Ingresar RUT "12.345.678-9" 3. Ingresar PIN "123456" 4. Click Login | Login exitoso. Recibe access_token JWT (8 horas), datos del empleado (id, nombre, RUT, cargo, departamento) | P0 |
| PTL-002 | Login con RUT sin puntos ni guion | Empleado con PIN configurado | 1. Ingresar RUT "123456789" (sin formato) | Login exitoso. La normalizacion de RUT funciona (quita puntos, guiones, espacios, convierte a mayuscula) | P0 |
| PTL-003 | Login con RUT incorrecto | Sin empleado con ese RUT | 1. Ingresar RUT inexistente | Error 401: "RUT o PIN incorrectos". No revelar si el RUT existe o no | P0 |
| PTL-004 | Login con PIN incorrecto | Empleado existe pero PIN errado | 1. Ingresar RUT correcto, PIN incorrecto | Error 401: "RUT o PIN incorrectos" | P0 |
| PTL-005 | Validacion formato PIN | -- | 1. Ingresar PIN con letras 2. Ingresar PIN de 4 digitos 3. Ingresar PIN de 8 digitos | Error 400: "PIN debe tener 6 digitos" y "PIN solo puede contener numeros" | P1 |
| PTL-006 | Validacion formato RUT | -- | 1. Ingresar RUT de menos de 7 caracteres 2. Ingresar RUT de mas de 12 caracteres | Error 400: "RUT invalido" | P1 |
| PTL-007 | Token expirado | Token de mas de 8 horas | 1. Usar token expirado en cualquier endpoint | Error 401: "Sesion expirada. Ingresa nuevamente." | P0 |
| PTL-008 | Token de dashboard no funciona en portal | Token JWT normal (no portal) | 1. Usar token tipo dashboard en endpoint portal | Error 401: "Token no corresponde al portal de trabajadores" | P1 |

### 4.2 Perfil del Trabajador

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PTL-010 | Ver perfil propio | Autenticado en portal | 1. GET /portal/me | Muestra: nombre, RUT, cargo, departamento, email, telefono, fecha ingreso, AFP, plan salud (fonasa/isapre), foto (si existe) | P0 |

### 4.3 Liquidaciones Portal

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PTL-020 | Listar liquidaciones propias | Empleado con liquidaciones confirmadas (done/paid) | 1. GET /portal/liquidaciones | Lista de liquidaciones del empleado (ultimo anho + anho anterior). Cada una con: numero, periodo, sueldo bruto, liquido. Solo ve las PROPIAS | P0 |
| PTL-021 | No ver liquidaciones de otro empleado | Empleado A autenticado | 1. Intentar acceder a liquidacion de empleado B (otro ID) | Error 404: "Liquidacion no encontrada" (el filtro por employee_id lo impide) | P0 |
| PTL-022 | Ver detalle liquidacion | Liquidacion propia existe | 1. GET /portal/liquidaciones/:id | Detalle con: haberes (imponibles + no imponibles), descuentos (previsional, salud, tributario), totales. Categorias correctamente asignadas | P0 |
| PTL-023 | Descargar PDF liquidacion portal | Liquidacion propia | 1. GET /portal/liquidaciones/:id/pdf | PDF descargado con datos empresa, empleado, haberes/descuentos, totales. Nombre archivo incluye mes-anho-nombre | P0 |
| PTL-024 | Solo ve liquidaciones done/paid | Liquidaciones en estado draft tambien | 1. Listar liquidaciones | Solo se muestran liquidaciones con state "done" o "paid", no borradores | P1 |

### 4.4 Contrato Portal

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PTL-030 | Ver contrato activo | Empleado con contrato open | 1. GET /portal/contrato | Muestra contrato activo (state=open) con: nombre, tipo, fecha inicio, sueldo, cargo, departamento. Contratos historicos en seccion separada | P0 |
| PTL-031 | Sin contrato activo | Empleado sin contrato vigente | 1. GET /portal/contrato | contrato_activo = null. Muestra mensaje apropiado | P2 |

### 4.5 Asistencia Portal

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PTL-040 | Ver asistencia mensual | Registros de asistencia en Odoo | 1. GET /portal/asistencia?mes=3&year=2026 | Lista de marcaciones (check_in, check_out, worked_hours). Resumen: total_horas, dias_trabajados, periodo label | P1 |

### 4.6 Ausencias Portal

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PTL-050 | Ver ausencias y saldos | Empleado con asignaciones y ausencias | 1. GET /portal/ausencias | Lista de ausencias (tipo, fechas, dias, estado). Saldos por tipo: asignados, tomados, restantes. Solo ultimos 12 meses + futuras | P1 |
| PTL-051 | Saldo de vacaciones correcto | 15 dias asignados, 5 tomados | 1. Consultar ausencias | Saldo vacaciones: allocated=15, taken=5, remaining=10 | P1 |

---

## Modulo 5: Archivo Previred

### 5.1 Preview Previred

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PRE-001 | Consultar datos Previred del periodo | Liquidaciones confirmadas, empleados con AFP e Isapre configurados | 1. Ir a Remuneraciones > Previred 2. Seleccionar periodo | Tabla con: RUT, codigo AFP, codigo Isapre, renta imponible, cotizaciones (AFP, SIS, salud, cesantia trab/empl, mutual), impuesto, tipo contrato, dias trabajados | P0 |
| PRE-002 | Codigos AFP Previred correctos | AFPs configuradas en Odoo con previred_code | 1. Verificar columna AFP | Cada empleado muestra el codigo Previred de su AFP (ej: "33" para Habitat, "05" para Cuprum) | P0 |
| PRE-003 | Codigo Isapre/Fonasa correcto | Empleados con Fonasa y con Isapre | 1. Verificar columna salud | Fonasa = "07". Isapres muestran su codigo Previred correspondiente | P0 |
| PRE-004 | Montos de cotizaciones correctos | Liquidaciones con lineas de AFP, salud, cesantia | 1. Comparar montos con liquidaciones individuales | AFP, salud, cesantia trabajador/empleador, impuesto unico coinciden con lo calculado en las liquidaciones | P0 |

### 5.2 Validacion Previred

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PRE-010 | Validacion exitosa | Todos los datos completos | 1. POST /previred/validate | validation.valid = true, errors = [] | P0 |
| PRE-011 | Validacion falla: sin RUT | Empleado sin RUT configurado | 1. Validar | Error para ese empleado: "RUT no definido" | P0 |
| PRE-012 | Validacion falla: sin codigo AFP | Empleado sin AFP asignada | 1. Validar | Error: "Codigo AFP Previred no asignado" | P0 |
| PRE-013 | Validacion falla: sin Isapre | Empleado sin codigo salud | 1. Validar | Error: "Codigo Isapre/FONASA Previred no asignado" | P1 |
| PRE-014 | Validacion falla: renta imponible 0 | Empleado con gross_wage = 0 | 1. Validar | Error: "Renta imponible es 0" | P1 |
| PRE-015 | Validacion falla: AFP = 0 | Cotizacion AFP no calculada | 1. Validar | Error: "Cotizacion AFP es 0" | P1 |
| PRE-016 | Multiples errores por empleado | Empleado sin RUT, sin AFP, renta 0 | 1. Validar | Todos los issues listados para ese empleado | P2 |

### 5.3 Generacion Archivo .pre

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PRE-020 | Descargar archivo .pre | Datos validados correctamente | 1. Click "Descargar archivo Previred" | Archivo descargado: previred_YYYY_MM.pre. Content-Type: text/plain. Content-Disposition: attachment | P0 |
| PRE-021 | Formato archivo correcto | Archivo generado | 1. Abrir archivo en editor texto | Cada linea = un empleado. Campos separados por ";". Campos en orden: RUT sin DV; DV; periodo YYYYMM; cod AFP; renta imponible; cotiz AFP; SIS; APV; cod Isapre; cotiz salud; salud adicional; AFC trabajador; AFC empleador; mutual; renta no imponible; impuesto; tipo contrato; dias trabajados; tipo jornada | P0 |
| PRE-022 | RUT separado correctamente | Empleado con RUT "12.345.678-9" | 1. Verificar linea en archivo | Primera columna = "12345678", segunda = "9". Sin puntos ni guiones | P0 |
| PRE-023 | Montos redondeados a enteros | Cotizaciones con decimales | 1. Verificar montos en archivo | Todos los montos redondeados a entero (Math.round) | P1 |
| PRE-024 | Archivo compatible con plataforma Previred | Archivo generado | 1. Subir archivo a plataforma Previred (staging) | Archivo aceptado sin errores de formato. Si hay errores, son de datos no de estructura | P0 |

---

## Modulo 6: PDFs Contables

### 6.1 Balance General PDF

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PDF-001 | Generar PDF Balance General | Datos contables en Odoo | 1. Ir a Contabilidad > Balance 2. Click "Descargar PDF" | PDF con: empresa, RUT, periodo, activos (corrientes + no corrientes), pasivos (corrientes + no corrientes), patrimonio (capital + resultado). Indica si cuadra. Archivo: Balance_YYYY_MM.pdf | P0 |
| PDF-002 | Balance cuadra: Activos = Pasivos + Patrimonio | Contabilidad correcta | 1. Verificar indicador "cuadra" | Diferencia Activos - (Pasivos + Patrimonio) < 0.01. Indicador verde | P0 |
| PDF-003 | Balance no cuadra | Asientos desbalanceados | 1. Verificar indicador | cuadra = false. Indicador rojo | P2 |

### 6.2 Estado de Resultados PDF

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PDF-010 | Generar PDF Estado de Resultados | Ingresos y gastos registrados | 1. Contabilidad > Resultados > PDF | PDF con: ingresos (ventas + otros), gastos (costo ventas + administrativos + depreciacion), utilidad bruta, utilidad neta. Archivo: Estado_Resultados_YYYY_MM.pdf | P0 |
| PDF-011 | Periodo anual acumulado | Consultar resultados en mes 6 | 1. Generar resultados para junio | Datos acumulados desde enero hasta junio del anho (desde YYYY-01-01 hasta YYYY-06-30). Solo asientos posted | P1 |

### 6.3 Libro Diario PDF

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PDF-020 | Generar PDF Libro Diario | Asientos contables en el periodo | 1. Contabilidad > Libro Diario > PDF | PDF con todos los asientos del mes. Cada asiento: numero, fecha, diario, lineas (cuenta, debe, haber). Sin paginacion (todos los registros) | P0 |
| PDF-021 | Libro diario filtra por journal | Seleccionar diario especifico | 1. Filtrar por diario "Ventas" 2. Generar PDF | Solo asientos del diario seleccionado | P2 |

### 6.4 Libro Mayor PDF

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| PDF-030 | Generar PDF Libro Mayor | Cuenta con movimientos | 1. Seleccionar cuenta 2. Click PDF | PDF con: cuenta (codigo + nombre), periodo, saldo inicial, movimientos (fecha, documento, debe, haber, saldo acumulado), saldo final. Archivo: Libro_Mayor_ID_YYYY_MM.pdf | P0 |
| PDF-031 | Saldo inicial correcto | Cuenta con movimientos en meses anteriores | 1. Consultar libro mayor de marzo 2. Verificar saldo inicial | Saldo inicial = suma de (debe - haber) de todos los movimientos posted antes del 01 del mes consultado | P0 |
| PDF-032 | Saldo acumulado progresivo | Multiples movimientos en el mes | 1. Verificar columna saldo acumulado | Cada fila: saldo = saldo_anterior + debe - haber. Saldo final coincide con ultimo saldo acumulado | P1 |
| PDF-033 | Libro mayor sin account_id | No seleccionar cuenta | 1. Intentar generar sin account_id | Error 400: "account_id es requerido" | P1 |

---

## Modulo 7: Conciliacion Bancaria Mejorada

### 7.1 Import OFX

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| CONC-001 | Importar archivo OFX | Archivo OFX valido, diario bancario configurado | 1. Ir a Conciliacion > Import 2. Seleccionar archivo OFX 3. Seleccionar diario banco 4. Click Importar | Transacciones parseadas y creadas en Odoo como bank statement lines. Respuesta: {parsed: N, created: N, errors: []} | P0 |
| CONC-002 | Parseo OFX extrae campos correctos | Archivo OFX con STMTTRN tags | 1. Importar archivo | Cada transaccion tiene: fecha (YYYYMMDD -> YYYY-MM-DD), monto con signo, descripcion (NAME/MEMO), referencia (FITID) | P0 |
| CONC-003 | OFX con transaccion incompleta | Tag STMTTRN sin DTPOSTED o TRNAMT | 1. Importar archivo defectuoso | Transaccion omitida. Error reportado: "Transaction missing date or amount: [FITID]" | P1 |

### 7.2 Import CSV

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| CONC-010 | Importar CSV BancoEstado | CSV formato BancoEstado (;) | 1. Seleccionar formato "bancoestado" 2. Importar | Columnas mapeadas correctamente: fecha col 0 (DD/MM/YYYY), descripcion col 1, debito col 3, credito col 4. Montos: credit - debit. Header omitido | P0 |
| CONC-011 | Importar CSV BCI | CSV formato BCI (;) | 1. Seleccionar formato "bci" | Columnas: fecha col 0, descripcion col 2, monto col 3, referencia col 1. Separador ; | P1 |
| CONC-012 | Importar CSV Santander | CSV formato Santander (,) | 1. Seleccionar formato "santander" | Columnas: fecha col 0, descripcion col 1, debito col 2, credito col 3, ref col 4. Separador , | P1 |
| CONC-013 | Importar CSV generico | CSV con fecha, descripcion, monto | 1. Seleccionar formato "generic" | Columnas: fecha col 0, descripcion col 1, monto col 2, ref col 3. Separador , | P1 |
| CONC-014 | Formato fecha chileno DD/MM/YYYY | CSV con fechas en formato chileno | 1. Importar | Fechas convertidas correctamente: "15/03/2026" -> "2026-03-15" | P0 |
| CONC-015 | Montos formato chileno | CSV con montos "1.234.567" (puntos como miles) | 1. Importar | Montos parseados correctamente: "1.234.567" -> 1234567. Manejo de "$" y espacios | P0 |
| CONC-016 | CSV con filas malformadas | CSV con filas vacias o con menos de 3 columnas | 1. Importar | Filas malformadas omitidas silenciosamente. Filas validas importadas | P2 |
| CONC-017 | CSV monto cero omitido | Fila con monto = 0 | 1. Importar | Fila con monto 0 genera warning en errors pero no se crea statement line | P3 |

### 7.3 Auto-Matching

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| CONC-020 | Auto-match: monto exacto + mismo partner (95%) | Extracto y movimiento con mismo monto y partner | 1. Ejecutar auto-match | Sugerencia con confidence=95, reason incluye nombre del partner | P0 |
| CONC-021 | Auto-match: monto exacto + rango fecha (90%) | Mismo monto, diferencia <= 3 dias, distinto partner | 1. Ejecutar auto-match | Sugerencia con confidence=90, reason incluye dias de diferencia | P0 |
| CONC-022 | Auto-match: referencia coincide (85%) | Referencia de extracto contiene numero documento | 1. Ejecutar auto-match | Sugerencia con confidence=85, reason incluye numero documento | P1 |
| CONC-023 | Auto-match: monto aproximado (70%) | Monto con 0.5% diferencia, dentro de 5 dias | 1. Ejecutar auto-match | Sugerencia con confidence=70, reason incluye % diferencia y dias | P1 |
| CONC-024 | Sin matches | Extracto y movimientos no coinciden | 1. Ejecutar auto-match | suggestions = [], total_matches = 0, avg_confidence = 0 | P2 |
| CONC-025 | Match exclusivo (greedy) | Una linea extracto matchea con 2 movimientos | 1. Ejecutar auto-match | Solo se sugiere el mejor match. Cada linea y cada movimiento aparece en maximo 1 sugerencia | P0 |
| CONC-026 | Lineas ya conciliadas excluidas | Extracto con lineas is_reconciled=true | 1. Ejecutar auto-match | Lineas ya conciliadas se omiten del matching | P1 |

### 7.4 Aplicar Matches

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| CONC-030 | Aplicar matches sugeridos | Auto-match con sugerencias | 1. Seleccionar matches 2. Aplicar | Lineas reconciliadas en Odoo. Respuesta: {reconciled: N, total: N, errors: []} | P0 |
| CONC-031 | Match parcial con errores | Algunos matches fallan en Odoo | 1. Aplicar matches | matches exitosos se concilian, fallidos se reportan en errors. reconciled < total | P1 |
| CONC-032 | Sin matches para aplicar | Array vacio | 1. POST /conciliacion/apply-matches con matches=[] | Error 400: "matches array required" | P2 |

### 7.5 Conciliacion Clasica

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| CONC-040 | Ver estado conciliacion | Diario bancario con movimientos | 1. GET /conciliacion?journal_id=X&mes=M&year=Y | extracto (statement lines), sin_conciliar (move lines no reconciliadas), totales. Datos mapeados a espanhol | P0 |
| CONC-041 | Conciliar manualmente (Odoo auto) | Lineas sin conciliar seleccionadas | 1. POST /conciliacion/reconcile con statement_line_ids | Conciliacion ejecutada en Odoo via action_auto_reconcile | P1 |
| CONC-042 | Conciliacion auto masiva | Diario con muchas lineas | 1. POST /conciliacion/auto con journal_id | Todas las lineas no conciliadas procesadas. Respuesta: {lines_processed: N} | P2 |

---

## Modulo 8: Centros de Costo

### 8.1 CRUD Centros de Costo

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| CC-001 | Listar centros de costo | Centros creados en Odoo (account.analytic.account) | 1. GET /centros-costo | Lista con: id, name, code, balance, active. Ordenados por codigo ascendente | P0 |
| CC-002 | Crear centro de costo | Usuario autenticado | 1. POST /centros-costo con {name: "Proyecto X", code: "PX001"} | Centro creado en Odoo. Respuesta: {id: N} | P0 |
| CC-003 | Crear sin nombre | Body sin name | 1. POST /centros-costo sin name | Error 400: "name is required" | P1 |
| CC-004 | Actualizar centro de costo | Centro existente | 1. PUT /centros-costo/:id con {name: "Nuevo nombre"} | Centro actualizado. success = true | P1 |
| CC-005 | Desactivar centro de costo | Centro existente | 1. PUT /centros-costo/:id con {active: false} | Centro desactivado. Ya no aparece en listado (solo activos) | P2 |

### 8.2 Movimientos por Centro de Costo

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| CC-010 | Ver movimientos de un centro | Centro con lineas analiticas | 1. GET /centros-costo/:id/movimientos?mes=M&year=Y | Lista de movimientos: fecha, nombre, monto, cuenta contable, partner. Total del periodo | P0 |
| CC-011 | Filtro por periodo funciona | Movimientos en diferentes meses | 1. Consultar marzo 2. Consultar abril | Solo se muestran movimientos del mes consultado | P1 |

### 8.3 Reporte Centros de Costo

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| CC-020 | Reporte consolidado por centro | Multiples centros con movimientos | 1. GET /centros-costo/reporte?mes=M&year=Y | Tabla resumen: centro, total del periodo, cantidad movimientos. Gran total al final | P0 |
| CC-021 | Reporte periodo sin movimientos | Periodo sin lineas analiticas | 1. Consultar periodo vacio | reporte = [], gran_total = 0 | P3 |

---

## Modulo 9: Flujo de Caja

### 9.1 Datos Flujo de Caja

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| FC-001 | Consultar flujo de caja | Datos contables de al menos 3 meses | 1. GET /flujo-caja | Respuesta con: saldo_actual (de diarios bancarios), por_cobrar (cuentas por cobrar no conciliadas), por_pagar (cuentas por pagar no conciliadas), historico (6 meses), proyeccion (6 meses) | P0 |
| FC-002 | Saldo actual correcto | Diarios bancarios con movimientos | 1. Verificar saldo_actual | Saldo = suma de todos los montos de bank statement lines de diarios tipo "bank" | P0 |
| FC-003 | Por cobrar / por pagar correctos | Facturas pendientes | 1. Verificar montos | por_cobrar = suma absolute de balance de move lines tipo asset_receivable no conciliadas. por_pagar = idem para liability_payable | P1 |
| FC-004 | Historico: desglose correcto | 6 meses de datos | 1. Verificar cada periodo historico | Cada mes tiene: ingresos (cuentas income), gastos (estimado 60% fijos + 40% variables), remuneraciones (de payslips done), impuestos (estimado 19% * 30% de ingresos) | P1 |

### 9.2 Proyeccion

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| FC-010 | Proyeccion 6 meses por defecto | Datos historicos disponibles | 1. GET /flujo-caja (sin param months) | 6 periodos de proyeccion. Cada uno con: month, year, label ("Mes YYYY"), ingresos, gastos, remuneraciones, impuestos, saldo_proyectado | P0 |
| FC-011 | Proyeccion parametrizable | -- | 1. GET /flujo-caja?months=12 | 12 periodos de proyeccion | P2 |
| FC-012 | Proyeccion usa promedio movil | Historico con datos variables | 1. Verificar valores proyectados | Cada campo proyectado = promedio de los mismos campos en el historico. Saldo acumulativo mes a mes | P1 |
| FC-013 | Labels de meses en espanhol | Proyeccion generada | 1. Verificar labels | Labels: "Enero 2026", "Febrero 2026", etc. (en espanhol) | P3 |
| FC-014 | Proyeccion con historico vacio | Sin datos historicos | 1. GET /flujo-caja en empresa nueva | proyeccion = [] (se retorna array vacio si no hay historico) | P2 |
| FC-015 | Saldo proyectado acumulativo | Proyeccion de 6 meses | 1. Verificar saldo_proyectado de cada mes | saldo_mes_N = saldo_mes_N-1 + ingresos_promedio - gastos_promedio. Primer mes parte del saldo_actual | P1 |
| FC-016 | Cambio de anho en proyeccion | Consultado en octubre | 1. Verificar meses 4-6 de proyeccion | Meses nov, dic del anho actual y ene, feb, mar, abr del siguiente. Year cambia correctamente | P2 |

---

## Pruebas de Integracion Odoo

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| INT-001 | Fallback cuando Odoo no disponible (LCV) | Odoo apagado o timeout | 1. Detener Odoo 2. Consultar LCV | Datos cargados desde DB local (source="local"). Log warning "Odoo LCV unavailable" | P0 |
| INT-002 | Fallback F29 | Odoo no disponible | 1. Consultar F29 | Calculo local: ventas_neto desde DTEs, debito_iva = neto * 19%, PPM = neto * 1.5%. Nota indica "Conecte Odoo para datos contables precisos" | P0 |
| INT-003 | Fallback Stats | Odoo no disponible | 1. Consultar stats | Stats desde DTEs locales agrupados por estado | P1 |
| INT-004 | Odoo 18: account.account sin company_id | Odoo 18 activo | 1. Consultar plan de cuentas | Usa search + read en vez de searchRead (workaround Odoo 18 ValueError) | P0 |
| INT-005 | Finiquito cierra contrato en Odoo | Finiquito confirmado | 1. Confirmar finiquito | Contrato del empleado cambia a state="close" y date_end = fecha_terminacion. Verificar en Odoo directamente | P0 |
| INT-006 | Liquidacion PDF con datos empresa Odoo | Empresa con logo en Odoo | 1. Generar PDF liquidacion | PDF incluye logo de la empresa (decodificado de base64), nombre, RUT, direccion | P1 |
| INT-007 | Conciliacion bancaria escribe en Odoo | Import + reconcile | 1. Importar cartola 2. Conciliar lineas | bank.statement.line creadas en Odoo. Reconciliacion ejecutada via action_auto_reconcile | P0 |
| INT-008 | Previred lee codigos desde Odoo | AFPs e Isapres con previred_code | 1. Generar preview Previred | Codigos leidos de l10n_cl.afp.previred_code y l10n_cl.isapre.previred_code | P0 |
| INT-009 | Multi-company: datos filtrados por company_id | Usuario con company_id=X | 1. Consultar cualquier endpoint | Solo datos de company_id del usuario. No datos de otras empresas | P0 |
| INT-010 | Asientos contables CRUD en Odoo | Diario contable configurado | 1. Crear asiento 2. Publicar 3. Revertir a borrador 4. Eliminar | Cada operacion reflejada en Odoo. Asiento publicado no eliminable. Solo borradores se eliminan | P1 |

---

## Pruebas de Edge Cases y Errores

| ID | Descripcion | Precondiciones | Pasos | Resultado Esperado | Prioridad |
|----|-------------|----------------|-------|--------------------|-----------|
| ERR-001 | Token JWT expirado | Token de mas de 24 horas | 1. Hacer request con token expirado | Error 401 en todos los endpoints protegidos | P0 |
| ERR-002 | Request sin token | Sin header Authorization | 1. Hacer request sin token | Error 401: "Token de acceso requerido" | P0 |
| ERR-003 | Mes invalido (0 o 13) | -- | 1. GET /lcv?mes=13 | Comportamiento robusto: no crash. Puede devolver datos vacios o error controlado | P2 |
| ERR-004 | Anho invalido (negativo o futuro lejano) | -- | 1. GET /lcv?year=2099 | Respuesta vacia sin crash | P3 |
| ERR-005 | ID inexistente en detalle | -- | 1. GET /liquidaciones/99999999 | Error 404: "Liquidacion no encontrada" (no 500) | P1 |
| ERR-006 | Asiento que no cuadra (debe != haber) | -- | 1. POST /asientos con debit total != credit total | Error 400: "El asiento no cuadra: Debe != Haber" (validacion Zod refine) | P0 |
| ERR-007 | Cuenta contable con movimientos: no eliminar | Cuenta con asientos asociados | 1. DELETE /plan-cuentas/:id | Error 502: "Error eliminando cuenta (puede tener movimientos asociados)" | P1 |
| ERR-008 | Import cartola: campos requeridos | Body sin content o format | 1. POST /conciliacion/import-file sin campos | Error 400: "content, format, and journal_id are required" | P1 |
| ERR-009 | OFX malformado | Archivo sin tags STMTTRN | 1. Importar archivo OFX roto | parsed=0, created=0, errors puede tener mensajes | P2 |
| ERR-010 | CSV vacio | Archivo CSV solo con header | 1. Importar CSV vacio | parsed=0, created=0 sin crash | P2 |
| ERR-011 | Finiquito: empleado sin contrato activo | Empleado con contrato cerrado | 1. Intentar crear finiquito con contrato cerrado | El domain del formulario filtra contratos state=open. Si se fuerza via API, error controlado | P1 |
| ERR-012 | Finiquito: empleado 0 meses antiguedad | Fecha terminacion = fecha inicio contrato | 1. Crear y calcular | years_service = 0, meses = 0. Indemnizacion = 0 (0 anhos * base). Vacaciones proporcionales = 0. Total incluye solo sueldo proporcional y gratificacion | P1 |
| ERR-013 | Finiquito: UF = 0 (no cap) | Sin valor UF ingresado | 1. Calcular finiquito sin UF | monthly_cap = infinity. Indemnizacion sin tope (usa avg_wage_3m completo). Nota: esto puede ser un issue si el sueldo es alto | P1 |
| ERR-014 | Portal: login bruteforce | Multiples intentos fallidos | 1. 10 intentos con PIN incorrecto | (Verificar si hay rate limiting). Cada intento retorna 401 sin revelar info adicional | P2 |
| ERR-015 | Libro remuneraciones: empleado sin RUT | Empleado sin identification_id | 1. Generar libro | Fila del empleado muestra RUT vacio. No crash | P2 |
| ERR-016 | Previred: empleado sin contrato activo | Liquidacion existe pero contrato cerrado | 1. Generar preview Previred | tipo_contrato default "1". No crash | P2 |
| ERR-017 | Flujo caja: empresa sin diarios bancarios | Sin account.journal tipo bank | 1. GET /flujo-caja | saldo_actual = 0. Historico y proyeccion funcionan con saldo 0 | P2 |
| ERR-018 | Conciliacion auto-match: tolerancia dias | Diferencia de 4 dias (supera default 3) | 1. Ejecutar auto-match | No match para monto exacto (rule 2 requiere <= 3 dias). Posible match rule 4 si monto aprox y <= 5 dias | P2 |

---

## Pruebas de UI/UX

| ID | Descripcion | Pasos | Resultado Esperado | Prioridad |
|----|-------------|-------|--------------------|-----------|
| UX-001 | Navegacion entre modulos contables | 1. Recorrer: Plan Cuentas > Libro Diario > Libro Mayor > Balance > Resultados > Conciliacion | Navegacion fluida. Breadcrumbs correctos. No hay paginas rotas | P0 |
| UX-002 | Selector de periodo global | 1. Cambiar mes/anho en cualquier reporte 2. Verificar que datos se actualizan | Datos del periodo seleccionado se cargan. Loading state visible durante carga | P0 |
| UX-003 | Formato moneda CLP | 1. Verificar montos en todas las tablas | Montos en formato chileno: $1.234.567 (punto como separador de miles). Sin decimales para CLP | P0 |
| UX-004 | Formato RUT | 1. Verificar RUTs en tablas y PDFs | RUT con formato: 12.345.678-9 (con puntos y guion) | P1 |
| UX-005 | Tabla libro remuneraciones responsive | 1. Ver tabla en pantalla ancha 2. Ver en pantalla angosta | Tabla con scroll horizontal en pantallas chicas. Headers fijos. Datos legibles | P1 |
| UX-006 | PDFs legibles en impresion | 1. Generar cualquier PDF 2. Imprimir | Tamano carta (o legal para libro diario). Margenes adecuados. Texto legible. Sin corte de tablas | P1 |
| UX-007 | Portal trabajador: UX mobile-first | 1. Acceder al portal desde celular | Login, lista liquidaciones, detalle y descarga PDF funcionan correctamente en mobile. Touch-friendly | P0 |
| UX-008 | Conciliacion: interfaz de matching | 1. Ejecutar auto-match 2. Revisar sugerencias | Sugerencias visibles con confidence (color-coded: verde >90%, amarillo >70%, rojo <70%). Boton aprobar/rechazar cada match | P1 |
| UX-009 | Flujo de caja: grafico | 1. Ver pantalla flujo de caja | Grafico mostrando historico + proyeccion. Diferenciacion visual entre real y proyectado (ej: linea solida vs punteada) | P1 |
| UX-010 | Loading states en todos los endpoints | 1. Navegar por toda la app | Cada pantalla muestra spinner/skeleton durante carga. No flash de contenido vacio | P1 |
| UX-011 | Mensajes de error amigables | 1. Provocar errores (Odoo caido, datos faltantes) | Mensajes en espanhol, claros, sin stack traces. Sugerencia de accion cuando sea posible | P1 |
| UX-012 | Empty states | 1. Ver pantallas sin datos (empresa nueva) | Mensaje informativo ("No hay liquidaciones para este periodo") con accion sugerida ("Crear nomina") | P2 |
| UX-013 | Finiquitos: formulario guiado | 1. Crear nuevo finiquito | Selector de empleado filtra por empresa. Al seleccionar empleado, carga contratos activos. Causal con descripcion del articulo legal | P1 |
| UX-014 | Finiquitos: badges de estado | 1. Ver lista de finiquitos | Borrador=gris, Calculado=azul, Confirmado=amarillo, Firmado=verde. Acciones visibles segun estado | P2 |
| UX-015 | Previred: errores de validacion destacados | 1. Validar con datos incompletos | Empleados con errores destacados en rojo. Issues listados por empleado. Boton generar archivo deshabilitado si hay errores | P1 |

---

## Checklist Smoke Test Rapido

Test rapido para verificar que todo funciona antes de un deploy. Tiempo estimado: 30 minutos.

### Autenticacion
- [ ] Login dashboard exitoso
- [ ] Login portal trabajador (RUT + PIN) exitoso
- [ ] Token expirado retorna 401

### Contabilidad
- [ ] Plan de cuentas carga listado desde Odoo
- [ ] Libro diario muestra asientos del mes
- [ ] Libro mayor muestra movimientos de una cuenta
- [ ] Balance general muestra activos/pasivos/patrimonio
- [ ] Estado de resultados muestra ingresos/gastos
- [ ] PDF balance se descarga sin error
- [ ] PDF resultados se descarga sin error

### Remuneraciones
- [ ] Lista empleados carga desde Odoo
- [ ] Lista liquidaciones carga con datos
- [ ] PDF liquidacion se descarga correctamente
- [ ] Libro remuneraciones muestra tabla con datos
- [ ] CSV libro remuneraciones se descarga

### Finiquitos
- [ ] Crear finiquito (borrador)
- [ ] Calcular finiquito (montos se calculan)
- [ ] Confirmar finiquito (contrato se cierra)
- [ ] PDF finiquito se descarga

### Portal Trabajador
- [ ] Login con RUT + PIN
- [ ] Ver perfil (/me)
- [ ] Listar liquidaciones propias
- [ ] Descargar PDF liquidacion desde portal
- [ ] Ver contrato activo

### Previred
- [ ] Preview datos Previred
- [ ] Validacion pasa (si datos completos)
- [ ] Archivo .pre se descarga

### Conciliacion Bancaria
- [ ] Import archivo OFX
- [ ] Import archivo CSV (BancoEstado)
- [ ] Ver estado conciliacion
- [ ] Auto-match genera sugerencias

### Centros de Costo
- [ ] Listar centros de costo
- [ ] Crear nuevo centro
- [ ] Ver movimientos de un centro
- [ ] Reporte consolidado

### Flujo de Caja
- [ ] Consultar flujo de caja
- [ ] Saldo actual, por cobrar, por pagar se muestran
- [ ] Historico 6 meses con datos
- [ ] Proyeccion 6 meses generada

---

## Notas Importantes

1. **Contexto Chileno:** Todos los calculos de finiquitos siguen el Codigo del Trabajo chileno. Los montos deben coincidir con lo que calcularia un abogado laboral.

2. **SII:** Los reportes LCV y F29 son orientativos. El usuario debe verificar antes de presentar al SII. Incluir disclaimer.

3. **Previred:** El archivo .pre debe ser compatible con la plataforma oficial. Probar upload en ambiente de prueba de Previred si es posible.

4. **Odoo 18:** Hay workarounds especificos para account.account (search + read en vez de searchRead). Verificar que no hay regresiones con updates de Odoo.

5. **Multi-tenant:** TODOS los endpoints filtran por company_id. Verificar que no hay leak de datos entre empresas.

6. **PDFs:** Verificar que los PDFs generados son validos (no corruptos), legibles, y con formato profesional para presentar a auditores o instituciones.
