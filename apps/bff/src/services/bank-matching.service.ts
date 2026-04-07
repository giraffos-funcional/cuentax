/**
 * CUENTAX — Bank Auto-Matching Service
 * Suggests matches between bank statement lines and unreconciled journal entries.
 */

export interface StatementLine {
  id: number
  fecha: string
  referencia: string
  monto: number
  conciliado: boolean
  partner: string | null
}

export interface MoveLine {
  id: number
  fecha: string
  documento: string
  descripcion: string
  monto: number
  partner: string | null
}

export interface MatchSuggestion {
  statement_line_id: number
  move_line_id: number
  confidence: number // 0-100
  reason: string
}

/**
 * Find matching pairs between statement lines and move lines.
 * Rules:
 * 1. Exact amount match within date range + same partner -> 95% confidence
 * 2. Exact amount match within date range -> 90% confidence
 * 3. Same reference/document number -> 85% confidence
 * 4. Amount match within 1% tolerance, within extended date range -> 70% confidence
 */
export function findMatches(
  extracto: StatementLine[],
  sinConciliar: MoveLine[],
  options: { dayTolerance?: number; amountTolerance?: number } = {},
): MatchSuggestion[] {
  const dayTolerance = options.dayTolerance ?? 3
  const amountTolerance = options.amountTolerance ?? 0.01 // 1%

  const usedStatements = new Set<number>()
  const usedMoves = new Set<number>()

  // Sort by confidence: exact amount + same partner first
  const candidates: Array<MatchSuggestion & { priority: number }> = []

  for (const st of extracto) {
    if (st.conciliado) continue

    for (const mv of sinConciliar) {
      const daysDiff = Math.abs(
        (new Date(st.fecha).getTime() - new Date(mv.fecha).getTime()) / (1000 * 60 * 60 * 24),
      )

      const amountDiff = Math.abs(st.monto - mv.monto)
      const amountPct = Math.abs(st.monto) > 0 ? amountDiff / Math.abs(st.monto) : 1

      // Rule 1: Exact amount + same partner -> 95%
      if (amountDiff < 1 && st.partner && mv.partner && st.partner === mv.partner) {
        candidates.push({
          statement_line_id: st.id,
          move_line_id: mv.id,
          confidence: 95,
          reason: `Monto exacto + mismo contacto (${st.partner})`,
          priority: 1,
        })
      }
      // Rule 2: Exact amount within date range -> 90%
      else if (amountDiff < 1 && daysDiff <= dayTolerance) {
        candidates.push({
          statement_line_id: st.id,
          move_line_id: mv.id,
          confidence: 90,
          reason: `Monto exacto, ${Math.round(daysDiff)} dias de diferencia`,
          priority: 2,
        })
      }
      // Rule 3: Reference match -> 85%
      else if (
        st.referencia && mv.documento &&
        (st.referencia.includes(mv.documento) || mv.documento.includes(st.referencia))
      ) {
        candidates.push({
          statement_line_id: st.id,
          move_line_id: mv.id,
          confidence: 85,
          reason: `Referencia coincide: ${mv.documento}`,
          priority: 3,
        })
      }
      // Rule 4: Approximate amount + date range -> 70%
      else if (amountPct <= amountTolerance && daysDiff <= dayTolerance + 2) {
        candidates.push({
          statement_line_id: st.id,
          move_line_id: mv.id,
          confidence: 70,
          reason: `Monto ~${(amountPct * 100).toFixed(1)}% diferencia, ${Math.round(daysDiff)} dias`,
          priority: 4,
        })
      }
    }
  }

  // Sort by priority (best matches first), then assign greedily
  candidates.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence)

  const suggestions: MatchSuggestion[] = []

  for (const c of candidates) {
    if (usedStatements.has(c.statement_line_id) || usedMoves.has(c.move_line_id)) continue
    usedStatements.add(c.statement_line_id)
    usedMoves.add(c.move_line_id)
    suggestions.push({
      statement_line_id: c.statement_line_id,
      move_line_id: c.move_line_id,
      confidence: c.confidence,
      reason: c.reason,
    })
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence)
}
