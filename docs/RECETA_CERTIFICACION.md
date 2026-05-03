# Receta de Certificación SII (DTE Chile)

> Documento operacional. Refleja el flujo que certificó exitosamente a
> **SOCIEDAD INGENIERIA ZYNCRO SPA (RUT 76753753-0)** ante el SII bajo
> **Res. Ex. SII N° 80 de 2014** el **2026-05-02**.

---

## 1. Pasos del wizard (wizard real, no propaganda)

| Paso | Nombre | Quién ejecuta | Endpoint backend |
|---|---|---|---|
| 0 | Prerequisitos | Usuario sube `.pfx` + CAFs | `/certification/prerequisites` |
| 1 | Postulación | **Manual en portal SII** | `/certification/wizard/complete-step` |
| 2 | Set de Prueba | UI dispara | `/certification/wizard/set-prueba/upload` + `/process` |
| 3 | Simulación | UI dispara con plantilla fija | `/certification/wizard/simulacion/send` |
| 4 | Intercambio | **sii-bridge automático** (sin UI) | `/certification/wizard/intercambio/{receive,respond}` |
| 5 | Muestras | **sii-bridge automático** | `/certification/wizard/muestras/generate-bulk` |
| 6 | Declaración | **Manual en portal SII** | `/certification/wizard/complete-step` |

Pasos 4 y 5 los ejecuta el bridge a partir del envío hecho en Simulación;
la UI solo informa. Por eso el wizard muestra una sola tarjeta
"Asistido por bridge" para ambos.

---

## 2. Zona intocable — fixes congelados validados por SII

Estos commits son la receta que el SII aceptó. **No revertir, no refactorizar.**

| SHA | Fix |
|---|---|
| `d2729e4` | Solo `Signature` outer en `RespuestaDTE` / `EnvioRecibos` |
| `5f7527f` | Schema XSD strict — `Caratula NroDetalles` + `Declaracion` exacta |
| `272e860` | Schema compliance Paso 4 Intercambio (3 archivos) |
| `11500f0` | `tostring` serialization en intercambio (ISO-8859-1) |
| `135190b` | `parse_envio` leaf elements (lxml falsy bool) |

**Implicancias:**
- XML producido se serializa siempre con `encoding="ISO-8859-1"` (lxml `tostring`).
- `EnvioDTE.SetDTE.Caratula.NroDetalles` debe igualar el conteo real.
- En `RespuestaDTE` y `EnvioRecibos`, la firma `<Signature>` va solo en la raíz —
  no anidada por documento.
- `parse_envio` debe usar `tag is None` (no truthy/falsy) para detectar leafs.

Archivos relacionados (no editar sin entender la consecuencia):
- `apps/sii-bridge/app/services/dte_reception.py`
- `apps/sii-bridge/app/services/dte_emission.py`
- `apps/sii-bridge/app/services/libro_emission.py`
- `apps/sii-bridge/app/services/set_pruebas_parser.py`
- `apps/sii-bridge/app/services/timbre_electronico.py`

---

## 3. Datos de la empresa — qué tiene que estar completo

Antes de emitir, la empresa debe tener todos los campos requeridos
(la UI los marca como `*` y el BFF bloquea con 409 si falta alguno).

**Información General:**
- Razón social, RUT, Giro, Tipo de contribuyente
- Actividad económica principal (CIIU del SII — se autocompleta del
  endpoint `/companies/lookup-rut/:rut`)
- Dirección, Comuna, Ciudad

**Facturación Electrónica (Resolución SII):**
- Correo DTE (buzón al que llegan los DTEs recibidos)
- Ambiente (`certificacion` / `produccion`)
- Oficina Regional SII (ej. Santiago Oriente)
- Número y Fecha de Resolución SII (la que emitió el SII al certificar)

Endpoint: `GET /api/v1/companies/me/readiness` →
`{ ready: bool, missing: string[] }`.

---

## 4. Receta exacta (Pasos 4, 5 y libros) — no expuestos por UI

Estos endpoints existen y son los que ejecutaron la certificación,
pero el wizard no los dispara visualmente. Para ejecutarlos manualmente:

### 4.1 — Recibir EnvioDTE del SII (Paso 4)

```bash
curl -X POST "$BRIDGE/api/v1/certification/wizard/intercambio/receive" \
  -F "file=@envio_dte_recibido.xml" \
  -F "rut_emisor=76753753-0"
```

### 4.2 — Generar respuesta de Intercambio

```bash
curl -X POST "$BRIDGE/api/v1/certification/wizard/intercambio/respond" \
  -H "Content-Type: application/json" \
  -d '{
    "rut_emisor": "76753753-0",
    "rut_receptor": "76753753-0"
  }'
```

Devuelve los 3 XML firmados:
- `RespuestaDTE` (RecepcionDTE + ResultadoDTE)
- `EnvioRecibos`
- `Resultado de Aprobación Comercial`

### 4.3 — Generar muestras (Paso 5)

```bash
curl -X POST "$BRIDGE/api/v1/certification/wizard/muestras/generate-bulk" \
  -H "Content-Type: application/json" \
  -d '{ "rut_emisor": "76753753-0" }'
```

Genera PDFs con timbre PDF417 para todos los DTEs del último batch.

### 4.4 — Generar libros (LV/LC)

```bash
curl -X POST "$BRIDGE/api/v1/certification/wizard/libros/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "rut_emisor": "76753753-0",
    "periodo": "2026-05",
    "fecha_emision": "2026-05-02"
  }'
```

---

## 5. Troubleshooting rápido

| Síntoma | Causa probable | Fix |
|---|---|---|
| 409 `company_incomplete` al emitir | Empresa sin pestaña 2 completa | Llenar `/dashboard/empresa` → Facturación Electrónica |
| `Failed query: select "..."` en empresa | Migration 0006 no aplicada | `ALTER TABLE` corre en bootstrap del BFF; un redeploy lo soluciona |
| SII rechaza por `Schema XSD` | Algún commit congelado revertido | Revisar commits sección 2 |
| Bridge devuelve XML sin firma outer | Regression en `dte_reception.py` | Recuperar `d2729e4` |

---

## 6. Para certificar un cliente nuevo

1. Subir `.pfx` y CAFs en `/dashboard/herramientas/certificacion` (Paso 0)
2. Postular manualmente en `maullin.sii.cl` (Paso 1)
3. Subir set de prueba `.txt` desde el portal SII y dispararlo (Paso 2)
4. Click "Emitir simulación al SII" — usa la plantilla validada (Paso 3)
5. **Coordinar con bridge la respuesta de Intercambio** (curl 4.2 arriba)
6. Verificar avance en `pe_avance1`/`pe_avance7`
7. Firmar declaración en portal SII (Paso 6)
8. Apenas el SII emita la resolución, anotar número y fecha en
   `/dashboard/empresa` → Facturación Electrónica → cambiar ambiente a
   "Producción" y guardar
