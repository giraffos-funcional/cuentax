/**
 * CUENTAX — Cash Flow Forecast Service
 * Projects future cash flow based on historical data, receivables, and payables.
 */

export interface CashFlowPeriod {
  month: number       // 1-12
  year: number
  label: string       // "Abril 2026"
  ingresos: number    // Projected income
  gastos_fijos: number
  gastos_variables: number
  remuneraciones: number
  impuestos: number
  saldo_proyectado: number
}

export interface CashFlowForecastData {
  saldo_actual: number
  por_cobrar: number  // Total accounts receivable
  por_pagar: number   // Total accounts payable
  historico: CashFlowPeriod[]
  proyeccion: CashFlowPeriod[]
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

/**
 * Generate cash flow projections based on historical averages.
 * Uses simple moving average of last N months for each category.
 */
export function generateForecast(
  historico: CashFlowPeriod[],
  saldo_actual: number,
  months_ahead: number = 6,
): CashFlowPeriod[] {
  if (historico.length === 0) return []

  // Calculate averages from historical data
  const n = historico.length
  const avg = {
    ingresos: historico.reduce((s, h) => s + h.ingresos, 0) / n,
    gastos_fijos: historico.reduce((s, h) => s + h.gastos_fijos, 0) / n,
    gastos_variables: historico.reduce((s, h) => s + h.gastos_variables, 0) / n,
    remuneraciones: historico.reduce((s, h) => s + h.remuneraciones, 0) / n,
    impuestos: historico.reduce((s, h) => s + h.impuestos, 0) / n,
  }

  const proyeccion: CashFlowPeriod[] = []
  let saldo = saldo_actual

  const lastPeriod = historico[historico.length - 1]
  let currentMonth = lastPeriod.month
  let currentYear = lastPeriod.year

  for (let i = 0; i < months_ahead; i++) {
    currentMonth++
    if (currentMonth > 12) {
      currentMonth = 1
      currentYear++
    }

    const totalGastos = avg.gastos_fijos + avg.gastos_variables + avg.remuneraciones + avg.impuestos
    saldo = saldo + avg.ingresos - totalGastos

    proyeccion.push({
      month: currentMonth,
      year: currentYear,
      label: `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`,
      ingresos: Math.round(avg.ingresos),
      gastos_fijos: Math.round(avg.gastos_fijos),
      gastos_variables: Math.round(avg.gastos_variables),
      remuneraciones: Math.round(avg.remuneraciones),
      impuestos: Math.round(avg.impuestos),
      saldo_proyectado: Math.round(saldo),
    })
  }

  return proyeccion
}
