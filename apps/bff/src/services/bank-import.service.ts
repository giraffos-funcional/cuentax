/**
 * CUENTAX — Bank Statement Import Service
 * Parses OFX, CSV formats from Chilean banks into standardized statement lines.
 */

import { createHash } from 'crypto'

export interface ParsedStatementLine {
  date: string       // YYYY-MM-DD
  description: string
  amount: number     // positive = credit, negative = debit
  reference: string  // transaction reference
  /** Stable hash-based ID for deduplication (date|description|amount|reference). */
  external_id: string
}

/**
 * Generate a stable hash for a transaction. Same transaction across re-imports
 * produces the same hash, enabling safe deduplication in bank_transactions.
 */
export function transactionHash(
  date: string,
  description: string,
  amount: number,
  reference: string = '',
): string {
  const normalized = `${date}|${description.trim().toUpperCase()}|${amount.toFixed(2)}|${reference.trim()}`
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

export interface ParseResult {
  lines: ParsedStatementLine[]
  bank: string
  format: string
  errors: string[]
}

/** Parse OFX/QFX file content */
export function parseOFX(content: string): ParseResult {
  // OFX format: XML-like with STMTTRN tags
  const lines: ParsedStatementLine[] = []
  const errors: string[] = []

  // Extract transactions between <STMTTRN> tags
  const txRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let match: RegExpExecArray | null

  while ((match = txRegex.exec(content)) !== null) {
    const block = match[1]

    const getField = (name: string): string => {
      const fieldMatch = new RegExp(`<${name}>([^<\\n]+)`, 'i').exec(block)
      return fieldMatch ? fieldMatch[1].trim() : ''
    }

    const dtposted = getField('DTPOSTED')   // YYYYMMDD or YYYYMMDDHHMMSS
    const trnamt = getField('TRNAMT')        // Amount with sign
    const name = getField('NAME') || getField('MEMO')
    const fitid = getField('FITID')          // Unique transaction ID

    if (!dtposted || !trnamt) {
      errors.push(`Transaction missing date or amount: ${fitid}`)
      continue
    }

    // Parse date: YYYYMMDD -> YYYY-MM-DD
    const dateStr = `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`
    const amount = parseFloat(trnamt)
    const reference = fitid

    lines.push({
      date: dateStr,
      description: name,
      amount,
      reference,
      // OFX provides FITID which is already a unique ID — prefer it when present
      external_id: fitid ? `ofx:${fitid}` : transactionHash(dateStr, name, amount, reference),
    })
  }

  return { lines, bank: 'OFX', format: 'ofx', errors }
}

/** Bank-specific CSV column mappings */
interface CSVMapping {
  date: number        // Column index for date
  description: number // Column index for description
  amount: number      // Column index for amount (single column, signed)
  debit?: number      // Column index for debit (if separate)
  credit?: number     // Column index for credit (if separate)
  reference?: number  // Column index for reference
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM/DD/YYYY'
  separator: string   // CSV separator (usually ',' or ';')
  skipHeader: boolean
  /** Country context for amount parsing (CL uses dots for thousands, US uses commas) */
  country?: 'CL' | 'US'
}

const BANK_MAPPINGS: Record<string, CSVMapping> = {
  bancoestado: {
    date: 0, description: 1, amount: -1, debit: 3, credit: 4, reference: 2,
    dateFormat: 'DD/MM/YYYY', separator: ';', skipHeader: true,
  },
  bci: {
    date: 0, description: 2, amount: 3, reference: 1,
    dateFormat: 'DD/MM/YYYY', separator: ';', skipHeader: true,
  },
  santander: {
    date: 0, description: 1, amount: -1, debit: 2, credit: 3, reference: 4,
    dateFormat: 'DD/MM/YYYY', separator: ',', skipHeader: true,
  },
  generic: {
    date: 0, description: 1, amount: 2, reference: 3,
    dateFormat: 'DD/MM/YYYY', separator: ',', skipHeader: true,
  },
  // ── US Banks ────────────────────────────────────────────────
  chase: {
    date: 0, description: 2, amount: 5, reference: 4,
    dateFormat: 'MM/DD/YYYY', separator: ',', skipHeader: true,
    country: 'US',
  },
  bofa: {
    date: 0, description: 1, amount: 2,
    dateFormat: 'MM/DD/YYYY', separator: ',', skipHeader: true,
    country: 'US',
  },
  wells_fargo: {
    date: 0, description: 4, amount: 1,
    dateFormat: 'MM/DD/YYYY', separator: ',', skipHeader: false,
    country: 'US',
  },
  // ── US Fintechs ─────────────────────────────────────────────
  // Mercury Transaction Export CSV:
  // Date,Description,Amount,Status,Reference,Note,Account
  mercury: {
    date: 0, description: 1, amount: 2, reference: 4,
    dateFormat: 'MM/DD/YYYY', separator: ',', skipHeader: true,
    country: 'US',
  },
  // Brex Transaction Export CSV:
  // Date,Description,Memo,Amount,Category,Card,User
  brex: {
    date: 0, description: 1, amount: 3, reference: 2,
    dateFormat: 'MM/DD/YYYY', separator: ',', skipHeader: true,
    country: 'US',
  },
  // Ramp Transaction Export CSV:
  // Date,Merchant,Amount,User,Category,Memo,Transaction ID
  ramp: {
    date: 0, description: 1, amount: 2, reference: 6,
    dateFormat: 'MM/DD/YYYY', separator: ',', skipHeader: true,
    country: 'US',
  },
  // Relay Transaction Export CSV:
  // Date,Description,Amount,Balance,Account,Reference
  relay: {
    date: 0, description: 1, amount: 2, reference: 5,
    dateFormat: 'MM/DD/YYYY', separator: ',', skipHeader: true,
    country: 'US',
  },
  // Stripe Payouts CSV:
  // automatic_payout_effective_at_(UTC),description,gross,fees,net,automatic_payout_id
  // Amount column (net) is a positive deposit per payout.
  stripe: {
    date: 0, description: 1, amount: 4, reference: 5,
    dateFormat: 'YYYY-MM-DD', separator: ',', skipHeader: true,
    country: 'US',
  },
  // ── Chilean Fintechs ────────────────────────────────────────
  // Tenpo CSV:
  // Fecha,Descripción,Referencia,Monto,Saldo
  tenpo: {
    date: 0, description: 1, amount: 3, reference: 2,
    dateFormat: 'DD/MM/YYYY', separator: ';', skipHeader: true,
  },
  // Mach CSV (Banco BCI):
  // Fecha,Detalle,Cargo,Abono,Saldo
  mach: {
    date: 0, description: 1, amount: -1, debit: 2, credit: 3,
    dateFormat: 'DD/MM/YYYY', separator: ';', skipHeader: true,
  },
  generic_us: {
    date: 0, description: 1, amount: 2, reference: 3,
    dateFormat: 'MM/DD/YYYY', separator: ',', skipHeader: true,
    country: 'US',
  },
}

/** Parse date string to YYYY-MM-DD */
function parseDate(raw: string, format: string): string {
  const clean = raw.trim().replace(/"/g, '')
  if (format === 'DD/MM/YYYY' || format === 'DD-MM-YYYY') {
    const sep = format === 'DD/MM/YYYY' ? '/' : '-'
    const parts = clean.split(sep)
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  if (format === 'MM/DD/YYYY') {
    const parts = clean.split('/')
    if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  }
  if (format === 'YYYY-MM-DD') {
    // May include time component: "2025-04-15 18:30:00" or "2025-04-15T18:30:00Z"
    const datePart = clean.split(/[ T]/)[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart
  }
  return clean // Fallback
}

/** Parse numeric amount from Chilean format: 1.234.567 or -1.234.567 */
function parseAmountCL(raw: string): number {
  const clean = raw.trim().replace(/"/g, '').replace(/\$/g, '').replace(/\s/g, '')
  // Chilean: dots as thousands, comma as decimal
  const normalized = clean.replace(/\./g, '').replace(',', '.')
  return parseFloat(normalized) || 0
}

/** Parse numeric amount from US format: 1,234.56 or -1,234.56 */
function parseAmountUS(raw: string): number {
  const clean = raw.trim().replace(/"/g, '').replace(/\$/g, '').replace(/\s/g, '')
  // US: commas as thousands, period as decimal
  const normalized = clean.replace(/,/g, '')
  return parseFloat(normalized) || 0
}

/** Parse amount based on country context */
function parseAmount(raw: string, country?: 'CL' | 'US'): number {
  return country === 'US' ? parseAmountUS(raw) : parseAmountCL(raw)
}

/** Parse CSV bank statement */
export function parseCSV(content: string, bank: string = 'generic'): ParseResult {
  const mapping = BANK_MAPPINGS[bank] ?? BANK_MAPPINGS.generic
  const lines: ParsedStatementLine[] = []
  const errors: string[] = []

  const rows = content.split('\n').filter(r => r.trim())
  const startIdx = mapping.skipHeader ? 1 : 0

  for (let i = startIdx; i < rows.length; i++) {
    const cols = rows[i].split(mapping.separator).map(c => c.trim().replace(/^"|"$/g, ''))

    if (cols.length < 3) continue // Skip malformed rows

    const dateStr = parseDate(cols[mapping.date] ?? '', mapping.dateFormat)
    const description = cols[mapping.description] ?? ''

    let amount = 0
    if (mapping.amount >= 0) {
      amount = parseAmount(cols[mapping.amount] ?? '0', mapping.country)
    } else if (mapping.debit !== undefined && mapping.credit !== undefined) {
      const debit = parseAmount(cols[mapping.debit] ?? '0', mapping.country)
      const credit = parseAmount(cols[mapping.credit] ?? '0', mapping.country)
      amount = credit - debit
    }

    const reference = mapping.reference !== undefined ? (cols[mapping.reference] ?? '') : ''

    if (!dateStr || amount === 0) {
      if (description) errors.push(`Row ${i + 1}: could not parse date or amount`)
      continue
    }

    lines.push({
      date: dateStr,
      description,
      amount,
      reference,
      external_id: transactionHash(dateStr, description, amount, reference),
    })
  }

  return { lines, bank, format: 'csv', errors }
}

/** Auto-detect format and parse */
export function parseStatement(content: string, format: 'ofx' | 'csv', bank?: string): ParseResult {
  if (format === 'ofx') return parseOFX(content)
  return parseCSV(content, bank)
}

export { BANK_MAPPINGS }
