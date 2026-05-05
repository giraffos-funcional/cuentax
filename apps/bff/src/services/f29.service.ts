/**
 * F29 — Cálculo del Formulario 29 mensual del SII (Chile).
 *
 * F29 es la declaración mensual de IVA + retenciones que toda empresa
 * IVA-afecta debe presentar antes del día 12 del mes siguiente.
 *
 * Esta service calcula los códigos principales a partir de:
 *  - DTE emitidos del período (débito fiscal — códigos 502/503/538)
 *  - RCV detalles compras del período (crédito fiscal — códigos 519/520/553)
 *  - Ventas exentas (DTE 34, 41)
 *
 * NO genera el archivo SII real — eso requiere el upload firmado al
 * portal SII. Lo que devolvemos es un resumen con los códigos calculados
 * para que el contador los traspase manualmente o los exporte.
 *
 * Refs: SII Manual F29 (https://www.sii.cl/declaraciones_juradas/f29.htm)
 */
import { sql } from 'drizzle-orm'
import { db } from '@/db/client'

// Tipo DTE → categoría F29
const DTE_AFECTO         = [33, 56]                // Factura electrónica + nota débito
const DTE_EXENTO         = [34, 41]                // Factura exenta + boleta exenta
const DTE_BOLETA_AFECTA  = [39]                    // Boleta electrónica
const DTE_NOTA_CREDITO   = [61]                    // Reduce débito fiscal
const DTE_FACT_COMPRA    = [46]                    // Factura de compra (no aplica a débito)

export interface F29Result {
  period: string                  // YYYY-MM
  company_id: number
  // ── Débito fiscal (ventas)
  cod_502_facturas_afectas: { neto: number; iva: number; count: number }
  cod_503_boletas_afectas: { brutas: number; count: number }
  cod_538_total_debito: number
  // ── Ventas exentas
  cod_062_ventas_exentas: number
  // ── Crédito fiscal (compras)
  cod_519_facturas_recibidas: { neto: number; iva: number; count: number }
  cod_511_total_credito: number
  // ── Notas de crédito (reducen débito)
  cod_509_notas_credito: { neto: number; iva: number; count: number }
  // ── Resultado
  iva_a_pagar_o_devolver: number  // 538 - 511 - 509.iva (si negativo → remanente próximo período)
  // ── Datos para revisión
  warnings: string[]
}

export async function calculateF29(input: {
  companyId: number
  period: string  // YYYY-MM
}): Promise<F29Result> {
  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    throw new Error(`Invalid period (YYYY-MM): ${input.period}`)
  }
  const [year, month] = input.period.split('-').map(Number)
  if (!year || !month) throw new Error(`Bad period: ${input.period}`)

  // Last day of month for the range filter
  const periodStart = `${input.period}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const periodEnd = `${input.period}-${String(lastDay).padStart(2, '0')}`

  // ── DTE emitidos (débito + ventas exentas + notas crédito)
  const dteAggResult = await db.execute(sql`
    SELECT
      tipo_dte,
      count(*)::int                       AS n,
      COALESCE(SUM(monto_neto)::bigint, 0)  AS sum_neto,
      COALESCE(SUM(monto_iva)::bigint, 0)   AS sum_iva,
      COALESCE(SUM(monto_total)::bigint, 0) AS sum_total
    FROM dte_documents
    WHERE company_id = ${input.companyId}
      AND fecha_emision >= ${periodStart}::date
      AND fecha_emision <= ${periodEnd}::date
      AND estado IN ('aceptado', 'enviado', 'firmado')
    GROUP BY tipo_dte
  `)
  const dteRows = ((dteAggResult as any).rows ?? dteAggResult) as Array<{
    tipo_dte: number; n: number;
    sum_neto: string | number; sum_iva: string | number; sum_total: string | number;
  }>

  // ── RCV detalles compras (crédito fiscal)
  const rcvResult = await db.execute(sql`
    SELECT
      count(*)::int                       AS n,
      COALESCE(SUM(monto_neto)::bigint, 0)  AS sum_neto,
      COALESCE(SUM(monto_iva)::bigint, 0)   AS sum_iva
    FROM rcv_detalles d
    JOIN rcv_registros r ON r.id = d.rcv_id
    WHERE r.company_id = ${input.companyId}
      AND r.tipo = 'compras'
      AND r.year = ${year}
      AND r.mes  = ${month}
      AND d.tipo_dte = 33
  `)
  const rcvRow = (((rcvResult as any).rows ?? rcvResult)[0] ?? {}) as {
    n?: number; sum_neto?: string | number; sum_iva?: string | number
  }

  // ── Tabulate
  let cod_502_n = 0, cod_502_neto = 0, cod_502_iva = 0
  let cod_503_brutas = 0, cod_503_n = 0
  let cod_062_exentas = 0
  let cod_509_n = 0, cod_509_neto = 0, cod_509_iva = 0

  for (const r of dteRows) {
    const tipo = Number(r.tipo_dte)
    const neto  = Number(r.sum_neto)
    const iva   = Number(r.sum_iva)
    const total = Number(r.sum_total)
    const n     = Number(r.n)
    if (DTE_AFECTO.includes(tipo)) {
      cod_502_n    += n
      cod_502_neto += neto
      cod_502_iva  += iva
    } else if (DTE_BOLETA_AFECTA.includes(tipo)) {
      cod_503_brutas += total
      cod_503_n      += n
    } else if (DTE_EXENTO.includes(tipo)) {
      cod_062_exentas += total
    } else if (DTE_NOTA_CREDITO.includes(tipo)) {
      cod_509_n    += n
      cod_509_neto += neto
      cod_509_iva  += iva
    }
  }

  const cod_519_n    = Number(rcvRow.n ?? 0)
  const cod_519_neto = Number(rcvRow.sum_neto ?? 0)
  const cod_519_iva  = Number(rcvRow.sum_iva ?? 0)

  // ── Boletas: el IVA está incluido. Decompose: neto = bruto / 1.19, iva = bruto - neto.
  const boletaIva = Math.round(cod_503_brutas - cod_503_brutas / 1.19)

  const cod_538_total_debito = cod_502_iva + boletaIva  // débito = facturas + boletas
  const cod_511_total_credito = cod_519_iva
  const iva_neto = cod_538_total_debito - cod_511_total_credito - cod_509_iva

  // ── Warnings de coherencia
  const warnings: string[] = []
  if (cod_519_n === 0) {
    warnings.push(`No hay registros de compras (RCV) sincronizados para ${input.period}. El crédito fiscal puede estar incompleto.`)
  }
  if (DTE_FACT_COMPRA.length > 0) {
    const factCompra = dteRows.find((r) => DTE_FACT_COMPRA.includes(Number(r.tipo_dte)))
    if (factCompra && Number(factCompra.n) > 0) {
      warnings.push(`Hay ${factCompra.n} factura(s) de compra (tipo 46) emitidas — verificar si aplican a F29.`)
    }
  }
  if (iva_neto < 0) {
    warnings.push(`IVA negativo (${iva_neto}). Se considera remanente para el próximo período.`)
  }

  return {
    period: input.period,
    company_id: input.companyId,
    cod_502_facturas_afectas: { neto: cod_502_neto, iva: cod_502_iva, count: cod_502_n },
    cod_503_boletas_afectas:  { brutas: cod_503_brutas, count: cod_503_n },
    cod_538_total_debito,
    cod_062_ventas_exentas:   cod_062_exentas,
    cod_519_facturas_recibidas: { neto: cod_519_neto, iva: cod_519_iva, count: cod_519_n },
    cod_511_total_credito,
    cod_509_notas_credito:    { neto: cod_509_neto, iva: cod_509_iva, count: cod_509_n },
    iva_a_pagar_o_devolver:   iva_neto,
    warnings,
  }
}
