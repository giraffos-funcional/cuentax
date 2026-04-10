/**
 * CUENTAX — AI Chat Service (Claude-powered)
 * =============================================
 * Conversational assistant that answers questions about the user's company
 * data using tool calling. Streams responses as SSE events.
 *
 * Tools:
 *   - get_ventas_periodo: DTEs emitidos (ventas) del periodo
 *   - get_gastos_periodo: Gastos del periodo
 *   - get_folios_status: Estado de folios CAF
 *   - get_documentos_recientes: Ultimos 10 DTEs
 *   - get_contactos_top: Top clientes por facturacion
 *   - get_balance_iva: Balance IVA debito - credito
 */

import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm'
import { db } from '@/db/client'
import { dteDocuments, gastos, cafConfigs, contacts } from '@/db/schema'
import { logger } from '@/core/logger'

// ── Types ──────────────────────────────────────────────────────

export interface CompanyContext {
  companyId: number
  companyName: string
  companyRut: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type SSEWriter = (event: string) => void

// ── CLP Formatting ─────────────────────────────────────────────

function formatCLP(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`
}

// ── DTE Type Labels ────────────────────────────────────────────

const DTE_TYPE_LABELS: Record<number, string> = {
  33: 'Factura Electronica',
  34: 'Factura Exenta',
  39: 'Boleta Electronica',
  41: 'Boleta Exenta',
  56: 'Nota de Debito',
  61: 'Nota de Credito',
  110: 'Factura de Exportacion',
}

function dteName(tipo: number): string {
  return DTE_TYPE_LABELS[tipo] ?? `Tipo ${tipo}`
}

// ── Tool Definitions ───────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'get_ventas_periodo',
    description: 'Obtiene las ventas (DTEs emitidos) de un periodo mensual. Retorna cantidad por tipo de DTE, totales de montos neto, IVA y total, y los 5 documentos de mayor monto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mes: { type: 'number', description: 'Mes (1-12)' },
        year: { type: 'number', description: 'Ano (ej: 2026)' },
      },
      required: ['mes', 'year'],
    },
  },
  {
    name: 'get_gastos_periodo',
    description: 'Obtiene los gastos registrados de un periodo mensual. Retorna cantidad total, total por categoria y total de IVA credito.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mes: { type: 'number', description: 'Mes (1-12)' },
        year: { type: 'number', description: 'Ano (ej: 2026)' },
      },
      required: ['mes', 'year'],
    },
  },
  {
    name: 'get_folios_status',
    description: 'Obtiene el estado actual de los folios CAF (Codigo de Autorizacion de Folios). Retorna tipo DTE, folios disponibles y si necesita renovacion.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_documentos_recientes',
    description: 'Obtiene los ultimos 10 documentos tributarios electronicos (DTE) con su estado en el SII.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_contactos_top',
    description: 'Obtiene los principales clientes por monto total facturado.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_balance_iva',
    description: 'Calcula el balance de IVA: debito fiscal (ventas) menos credito fiscal (gastos + compras). Retorna IVA debito, IVA credito, balance y periodo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        mes: { type: 'number', description: 'Mes (1-12)' },
        year: { type: 'number', description: 'Ano (ej: 2026)' },
      },
      required: ['mes', 'year'],
    },
  },
]

// ── Tool Implementations ───────────────────────────────────────

async function executeGetVentasPeriodo(
  companyId: number,
  input: { mes: number; year: number },
): Promise<string> {
  const desde = `${input.year}-${String(input.mes).padStart(2, '0')}-01`
  const hasta = `${input.year}-${String(input.mes).padStart(2, '0')}-31`

  const [byType, totals, top5] = await Promise.all([
    // Count by tipo_dte
    db.select({
      tipo_dte: dteDocuments.tipo_dte,
      count: sql<number>`count(*)::int`,
    })
      .from(dteDocuments)
      .where(and(
        eq(dteDocuments.company_id, companyId),
        gte(dteDocuments.fecha_emision, desde),
        lte(dteDocuments.fecha_emision, hasta),
      ))
      .groupBy(dteDocuments.tipo_dte),

    // Totals
    db.select({
      total_neto: sql<number>`COALESCE(SUM(${dteDocuments.monto_neto}), 0)::bigint`,
      total_iva: sql<number>`COALESCE(SUM(${dteDocuments.monto_iva}), 0)::bigint`,
      total_monto: sql<number>`COALESCE(SUM(${dteDocuments.monto_total}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
      .from(dteDocuments)
      .where(and(
        eq(dteDocuments.company_id, companyId),
        gte(dteDocuments.fecha_emision, desde),
        lte(dteDocuments.fecha_emision, hasta),
      )),

    // Top 5 by monto
    db.select({
      tipo_dte: dteDocuments.tipo_dte,
      folio: dteDocuments.folio,
      razon_social_receptor: dteDocuments.razon_social_receptor,
      monto_total: dteDocuments.monto_total,
      fecha_emision: dteDocuments.fecha_emision,
    })
      .from(dteDocuments)
      .where(and(
        eq(dteDocuments.company_id, companyId),
        gte(dteDocuments.fecha_emision, desde),
        lte(dteDocuments.fecha_emision, hasta),
      ))
      .orderBy(desc(dteDocuments.monto_total))
      .limit(5),
  ])

  const t = totals[0]
  const porTipo = byType.map(r => `  - ${dteName(r.tipo_dte)}: ${r.count} documentos`).join('\n')
  const topDocs = top5.map(r =>
    `  - ${dteName(r.tipo_dte)} #${r.folio ?? 'S/F'} | ${r.razon_social_receptor} | ${formatCLP(r.monto_total ?? 0)} | ${r.fecha_emision}`
  ).join('\n')

  return [
    `Ventas periodo ${input.mes}/${input.year}:`,
    `Total documentos: ${t?.count ?? 0}`,
    `Monto neto: ${formatCLP(Number(t?.total_neto ?? 0))}`,
    `IVA debito: ${formatCLP(Number(t?.total_iva ?? 0))}`,
    `Monto total: ${formatCLP(Number(t?.total_monto ?? 0))}`,
    '',
    'Por tipo de documento:',
    porTipo || '  (sin documentos)',
    '',
    'Top 5 por monto:',
    topDocs || '  (sin documentos)',
  ].join('\n')
}

async function executeGetGastosPeriodo(
  companyId: number,
  input: { mes: number; year: number },
): Promise<string> {
  const desde = `${input.year}-${String(input.mes).padStart(2, '0')}-01`
  const hasta = `${input.year}-${String(input.mes).padStart(2, '0')}-31`

  const [byCategoria, totals] = await Promise.all([
    db.select({
      categoria: gastos.categoria,
      count: sql<number>`count(*)::int`,
      total: sql<number>`COALESCE(SUM(${gastos.monto_total}), 0)::bigint`,
    })
      .from(gastos)
      .where(and(
        eq(gastos.company_id, companyId),
        gte(gastos.fecha_documento, desde),
        lte(gastos.fecha_documento, hasta),
      ))
      .groupBy(gastos.categoria),

    db.select({
      count: sql<number>`count(*)::int`,
      total_neto: sql<number>`COALESCE(SUM(${gastos.monto_neto}), 0)::bigint`,
      total_iva: sql<number>`COALESCE(SUM(${gastos.monto_iva}), 0)::bigint`,
      total_monto: sql<number>`COALESCE(SUM(${gastos.monto_total}), 0)::bigint`,
    })
      .from(gastos)
      .where(and(
        eq(gastos.company_id, companyId),
        gte(gastos.fecha_documento, desde),
        lte(gastos.fecha_documento, hasta),
      )),
  ])

  const t = totals[0]
  const porCategoria = byCategoria.map(r =>
    `  - ${r.categoria}: ${r.count} gastos | ${formatCLP(Number(r.total))}`
  ).join('\n')

  return [
    `Gastos periodo ${input.mes}/${input.year}:`,
    `Total gastos: ${t?.count ?? 0}`,
    `Monto neto: ${formatCLP(Number(t?.total_neto ?? 0))}`,
    `IVA credito: ${formatCLP(Number(t?.total_iva ?? 0))}`,
    `Monto total: ${formatCLP(Number(t?.total_monto ?? 0))}`,
    '',
    'Por categoria:',
    porCategoria || '  (sin gastos registrados)',
  ].join('\n')
}

async function executeGetFoliosStatus(companyId: number): Promise<string> {
  const cafs = await db.select()
    .from(cafConfigs)
    .where(and(
      eq(cafConfigs.company_id, companyId),
      eq(cafConfigs.activo, true),
    ))

  if (cafs.length === 0) {
    return 'No hay folios CAF activos configurados para esta empresa.'
  }

  const lines = cafs.map(caf => {
    const disponibles = caf.folio_hasta - caf.folio_actual + 1
    const porcentajeUsado = ((caf.folio_actual - caf.folio_desde) / (caf.folio_hasta - caf.folio_desde + 1)) * 100
    const necesitaRenovacion = disponibles <= 10 || porcentajeUsado >= 80

    return [
      `  ${dteName(caf.tipo_dte)}:`,
      `    Rango: ${caf.folio_desde} - ${caf.folio_hasta}`,
      `    Folio actual: ${caf.folio_actual}`,
      `    Folios disponibles: ${disponibles}`,
      `    Uso: ${porcentajeUsado.toFixed(1)}%`,
      `    Necesita renovacion: ${necesitaRenovacion ? 'SI' : 'No'}`,
    ].join('\n')
  })

  return ['Estado de folios CAF:', ...lines].join('\n\n')
}

async function executeGetDocumentosRecientes(companyId: number): Promise<string> {
  const docs = await db.select({
    tipo_dte: dteDocuments.tipo_dte,
    folio: dteDocuments.folio,
    razon_social_receptor: dteDocuments.razon_social_receptor,
    monto_total: dteDocuments.monto_total,
    estado: dteDocuments.estado,
    fecha_emision: dteDocuments.fecha_emision,
  })
    .from(dteDocuments)
    .where(eq(dteDocuments.company_id, companyId))
    .orderBy(desc(dteDocuments.created_at))
    .limit(10)

  if (docs.length === 0) {
    return 'No hay documentos tributarios registrados.'
  }

  const lines = docs.map(d =>
    `  - ${dteName(d.tipo_dte)} #${d.folio ?? 'S/F'} | ${d.razon_social_receptor} | ${formatCLP(d.monto_total ?? 0)} | Estado: ${d.estado ?? 'borrador'} | ${d.fecha_emision}`
  )

  return ['Ultimos 10 documentos:', ...lines].join('\n')
}

async function executeGetContactosTop(companyId: number): Promise<string> {
  const topClients = await db.select({
    rut: dteDocuments.rut_receptor,
    razon_social: dteDocuments.razon_social_receptor,
    total_facturado: sql<number>`COALESCE(SUM(${dteDocuments.monto_total}), 0)::bigint`,
    count_documentos: sql<number>`count(*)::int`,
  })
    .from(dteDocuments)
    .where(eq(dteDocuments.company_id, companyId))
    .groupBy(dteDocuments.rut_receptor, dteDocuments.razon_social_receptor)
    .orderBy(desc(sql`SUM(${dteDocuments.monto_total})`))
    .limit(10)

  if (topClients.length === 0) {
    return 'No hay clientes con facturacion registrada.'
  }

  const lines = topClients.map((c, i) =>
    `  ${i + 1}. ${c.razon_social} (${c.rut}) | Total: ${formatCLP(Number(c.total_facturado))} | ${c.count_documentos} documentos`
  )

  return ['Top clientes por facturacion:', ...lines].join('\n')
}

async function executeGetBalanceIva(
  companyId: number,
  input: { mes: number; year: number },
): Promise<string> {
  const desde = `${input.year}-${String(input.mes).padStart(2, '0')}-01`
  const hasta = `${input.year}-${String(input.mes).padStart(2, '0')}-31`

  const [ventasIva, gastosIva] = await Promise.all([
    // IVA debito from ventas (DTEs emitidos)
    db.select({
      iva_debito: sql<number>`COALESCE(SUM(${dteDocuments.monto_iva}), 0)::bigint`,
    })
      .from(dteDocuments)
      .where(and(
        eq(dteDocuments.company_id, companyId),
        gte(dteDocuments.fecha_emision, desde),
        lte(dteDocuments.fecha_emision, hasta),
      )),

    // IVA credito from gastos
    db.select({
      iva_credito: sql<number>`COALESCE(SUM(${gastos.monto_iva}), 0)::bigint`,
    })
      .from(gastos)
      .where(and(
        eq(gastos.company_id, companyId),
        gte(gastos.fecha_documento, desde),
        lte(gastos.fecha_documento, hasta),
      )),
  ])

  const debito = Number(ventasIva[0]?.iva_debito ?? 0)
  const credito = Number(gastosIva[0]?.iva_credito ?? 0)
  const balance = debito - credito

  return [
    `Balance IVA periodo ${input.mes}/${input.year}:`,
    `IVA Debito Fiscal (ventas): ${formatCLP(debito)}`,
    `IVA Credito Fiscal (gastos): ${formatCLP(credito)}`,
    `Balance: ${formatCLP(balance)}`,
    '',
    balance > 0
      ? `Resultado: Debe pagar ${formatCLP(balance)} de IVA al SII.`
      : balance < 0
        ? `Resultado: Tiene un remanente de credito fiscal de ${formatCLP(Math.abs(balance))}.`
        : 'Resultado: IVA equilibrado, sin saldo a favor ni en contra.',
    '',
    'Nota: Este calculo es orientativo. Consulte con su contador para la declaracion oficial (F29).',
  ].join('\n')
}

// ── Tool Router ────────────────────────────────────────────────

async function executeTool(
  companyId: number,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'get_ventas_periodo':
      return executeGetVentasPeriodo(companyId, toolInput as { mes: number; year: number })
    case 'get_gastos_periodo':
      return executeGetGastosPeriodo(companyId, toolInput as { mes: number; year: number })
    case 'get_folios_status':
      return executeGetFoliosStatus(companyId)
    case 'get_documentos_recientes':
      return executeGetDocumentosRecientes(companyId)
    case 'get_contactos_top':
      return executeGetContactosTop(companyId)
    case 'get_balance_iva':
      return executeGetBalanceIva(companyId, toolInput as { mes: number; year: number })
    default:
      return `Herramienta "${toolName}" no disponible.`
  }
}

// ── System Prompt Builder ──────────────────────────────────────

function buildSystemPrompt(ctx: CompanyContext): string {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  return `Eres el asistente inteligente de CuentaX, una plataforma de gestion tributaria chilena.
Ayudas a ${ctx.companyName} (RUT: ${ctx.companyRut}) con consultas sobre sus documentos tributarios, gastos, clientes, folios y situacion impositiva.

Reglas:
- Responde siempre en espanol chileno, de forma clara y concisa
- Usa los datos reales de la empresa cuando esten disponibles
- Si no tienes datos suficientes, dilo honestamente
- Incluye montos en formato CLP (ej: $1.234.567)
- Para temas tributarios complejos, sugiere consultar con un contador
- Nunca des asesoria tributaria definitiva, solo orientacion general
- Puedes ayudar a explicar como usar las funcionalidades de CuentaX
- La fecha actual es ${now.toISOString().split('T')[0]}, mes actual: ${currentMonth}/${currentYear}
- Cuando el usuario pregunte por "este mes" o "el mes actual", usa mes=${currentMonth} y year=${currentYear}
- Cuando el usuario pregunte por "el mes pasado", usa el mes anterior al actual`
}

// ── Main Chat Service ──────────────────────────────────────────

class AIChatService {
  private client: Anthropic | null = null

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set')
      }
      this.client = new Anthropic({ apiKey })
    }
    return this.client
  }

  /**
   * Stream a chat response with tool calling support.
   * Writes SSE events via the provided writer function.
   */
  async streamChat(
    ctx: CompanyContext,
    messages: ChatMessage[],
    writeSSE: SSEWriter,
  ): Promise<void> {
    const client = this.getClient()
    const systemPrompt = buildSystemPrompt(ctx)

    // Convert to Anthropic message format
    const anthropicMessages: MessageParam[] = messages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    // Agentic loop: keep calling Claude until no more tool_use blocks
    let currentMessages = anthropicMessages
    const maxToolRounds = 5
    let round = 0

    while (round < maxToolRounds) {
      round++

      // Collect the full response to check for tool_use
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages: currentMessages,
      })

      let hasToolUse = false
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
      let currentToolId = ''
      let currentToolName = ''
      let currentToolInput = ''

      // Stream text deltas to client, accumulate tool_use blocks
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = (event as any).content_block
          if (block?.type === 'tool_use') {
            hasToolUse = true
            currentToolId = block.id
            currentToolName = block.name
            currentToolInput = ''
            writeSSE(JSON.stringify({ type: 'tool_use', name: block.name }))
          }
        } else if (event.type === 'content_block_delta') {
          const delta = (event as any).delta
          if (delta?.type === 'text_delta' && delta.text) {
            writeSSE(JSON.stringify({ type: 'text_delta', text: delta.text }))
          } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
            currentToolInput += delta.partial_json
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolId) {
            let parsedInput: Record<string, unknown> = {}
            try {
              parsedInput = currentToolInput ? JSON.parse(currentToolInput) : {}
            } catch {
              logger.warn({ toolName: currentToolName, rawInput: currentToolInput }, 'Failed to parse tool input')
            }
            toolUseBlocks.push({
              id: currentToolId,
              name: currentToolName,
              input: parsedInput,
            })
            currentToolId = ''
            currentToolName = ''
            currentToolInput = ''
          }
        }
      }

      // If no tool use, we are done
      if (!hasToolUse || toolUseBlocks.length === 0) {
        break
      }

      // Build assistant message with tool_use content blocks
      const finalMessage = await stream.finalMessage()
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: finalMessage.content },
      ]

      // Execute tools and build tool results
      const toolResults: ToolResultBlockParam[] = []
      for (const toolBlock of toolUseBlocks) {
        let result: string
        try {
          result = await executeTool(ctx.companyId, toolBlock.name, toolBlock.input)
          logger.info(
            { tool: toolBlock.name, companyId: ctx.companyId, input: toolBlock.input },
            'AI tool executed',
          )
        } catch (err) {
          logger.error(
            { err, tool: toolBlock.name, companyId: ctx.companyId },
            'AI tool execution failed',
          )
          result = `Error al consultar datos: ${err instanceof Error ? err.message : 'Error desconocido'}. Intenta de nuevo o reformula tu pregunta.`
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result,
        })
      }

      // Add tool results to messages for next round
      currentMessages = [
        ...currentMessages,
        { role: 'user' as const, content: toolResults },
      ]
    }

    writeSSE(JSON.stringify({ type: 'done' }))
  }
}

export const aiChatService = new AIChatService()
