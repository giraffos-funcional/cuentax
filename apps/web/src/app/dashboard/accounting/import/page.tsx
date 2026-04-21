'use client'

/**
 * Accounting — Import Bank Statement
 * Country-agnostic: works for CL (CLP) and US (USD). Copy in the page is
 * rendered in the user's locale.
 */

import { useState, useCallback, useRef, useMemo } from 'react'
import {
  Upload, FileText, Loader2, CheckCircle2, AlertCircle, AlertTriangle,
  ArrowRight, ArrowLeftRight, RefreshCw, FileX, Info,
} from 'lucide-react'
import { useImportAndClassify, useReconcileStatement } from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

const US_BANKS = [
  { value: 'chase',       label: 'Chase' },
  { value: 'bofa',        label: 'Bank of America' },
  { value: 'wells_fargo', label: 'Wells Fargo' },
  { value: 'generic_us',  label: 'Other / Generic (US)' },
]

const CL_BANKS = [
  { value: 'bancoestado', label: 'BancoEstado' },
  { value: 'bci',         label: 'BCI' },
  { value: 'santander',   label: 'Santander' },
  { value: 'bancochile',  label: 'Banco de Chile' },
  { value: 'itau',        label: 'Itaú' },
  { value: 'generic',     label: 'Otro / Genérico' },
]

interface ImportResult {
  country?: string
  currency?: string
  parsed: { bank: string; format: string; total_lines: number; parse_errors: string[] }
  persisted?: { inserted: number; skipped_duplicates: number; bank_account_id: number }
  transfers_detected?: number
  transfers?: Array<{ amount: number; date_out: string; date_in: string; description_out: string; description_in: string; confidence: number }>
  refunds_detected?: number
  refunds?: Array<{ amount: number; date_original: string; date_refund: string; vendor: string; confidence: number }>
  reconciliation?: {
    ok: boolean; expected_closing: number; computed_closing: number; diff: number;
    total_deposits: number; total_payments: number; transaction_count: number; note: string
  } | null
  classification?: {
    total: number; auto_approved: number; needs_review: number;
    unclassified: number; rule_matched: number
  } | null
  transactions: Array<{
    date: string; description: string; amount: number;
    account_name: string; category: string; confidence: number;
    reasoning: string; source: string; auto_approved: boolean
  }>
  errors: string[]
}

const t = {
  CL: {
    title: 'Importar Cartola Bancaria',
    subtitle: 'Sube CSV u OFX de tu banco. La IA clasifica cada movimiento y detecta transferencias y devoluciones.',
    bank: 'Banco',
    format: 'Formato',
    file: 'Archivo',
    choose: 'Elige un archivo...',
    dragHere: 'Arrastra tu cartola aquí',
    opening: 'Saldo inicial (opcional)',
    closing: 'Saldo final (opcional)',
    skipAi: 'Saltar clasificación IA (solo persistir + conciliar)',
    uploading: 'Parseando y clasificando...',
    parsed: 'Parseados',
    inserted: 'Nuevos',
    skipped: 'Duplicados saltados',
    transfers: 'Transferencias detectadas',
    refunds: 'Devoluciones detectadas',
    reconcile: 'Conciliación',
    balances: 'Cuadra',
    notBalance: 'No cuadra',
    transactions: 'Transacciones',
    total: 'Total',
    autoApproved: 'Auto-aprobadas',
    needsReview: 'Requieren revisión',
    unclassified: 'Sin clasificar',
    ruleMatched: 'Por regla aprendida',
    review: 'Revisar y Aprobar',
    parseWarnings: 'Advertencias de parseo',
    dedupMatched: 'ya existían',
  },
  US: {
    title: 'Import Bank Statement',
    subtitle: 'Upload a CSV or OFX from your bank. AI classifies each transaction and detects transfers and refunds.',
    bank: 'Bank',
    format: 'Format',
    file: 'File',
    choose: 'Choose file...',
    dragHere: 'Drag your statement here',
    opening: 'Opening balance (optional)',
    closing: 'Closing balance (optional)',
    skipAi: 'Skip AI classification (only persist + reconcile)',
    uploading: 'Parsing and classifying...',
    parsed: 'Parsed',
    inserted: 'New',
    skipped: 'Duplicates skipped',
    transfers: 'Transfers detected',
    refunds: 'Refunds detected',
    reconcile: 'Reconciliation',
    balances: 'Balances',
    notBalance: 'Gap detected',
    transactions: 'Transactions',
    total: 'Total',
    autoApproved: 'Auto-approved',
    needsReview: 'Needs review',
    unclassified: 'Unclassified',
    ruleMatched: 'Matched rules',
    review: 'Review & Approve',
    parseWarnings: 'Parse Warnings',
    dedupMatched: 'already existed',
  },
}

export default function ImportPage() {
  const { fmtCurrency, country } = useLocale()
  const { importAndClassify, loading, error } = useImportAndClassify()
  const { reconcile: runReconcile, loading: reconciling } = useReconcileStatement()
  const L = country === 'US' ? t.US : t.CL
  const banks = country === 'US' ? US_BANKS : CL_BANKS

  const [format, setFormat] = useState<'csv' | 'ofx'>('csv')
  const [bank, setBank] = useState(banks[0].value)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState<string>('')
  const [opening, setOpening] = useState<string>('')
  const [closing, setClosing] = useState<string>('')
  const [skipAi, setSkipAi] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const dropRef = useRef<HTMLLabelElement>(null)

  const readFile = async (file: File): Promise<string> => {
    setFileName(file.name)
    const detected = file.name.endsWith('.ofx') || file.name.endsWith('.qfx') ? 'ofx' : 'csv'
    setFormat(detected)
    const content = await file.text()
    setFileContent(content)
    return content
  }

  const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await readFile(file)
    setResult(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await readFile(file)
    setResult(null)
  }, [])

  const handleImport = useCallback(async () => {
    if (!fileContent) return
    try {
      const body: any = { content: fileContent, format, bank, skip_classify: skipAi }
      if (opening) body.opening_balance = Number(opening)
      if (closing) body.closing_balance = Number(closing)
      const res = await importAndClassify(body)
      setResult(res as ImportResult)
    } catch {
      /* hook sets error */
    }
  }, [fileContent, format, bank, skipAi, opening, closing, importAndClassify])

  const confidenceBadge = (c: number) => {
    if (c >= 0.8) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (c >= 0.5) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    return 'bg-red-500/20 text-red-400 border-red-500/30'
  }

  const fmtAmount = (n: number) => fmtCurrency(n)

  const stats = useMemo(() => {
    if (!result?.classification) return null
    return [
      { label: L.total,        value: result.classification.total,        color: 'text-white' },
      { label: L.autoApproved, value: result.classification.auto_approved, color: 'text-emerald-400' },
      { label: L.needsReview,  value: result.classification.needs_review,  color: 'text-amber-400' },
      { label: L.unclassified, value: result.classification.unclassified,  color: 'text-red-400' },
      { label: L.ruleMatched,  value: result.classification.rule_matched,  color: 'text-blue-400' },
    ]
  }, [result, L])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{L.title}</h1>
        <p className="text-sm text-zinc-400 mt-1">{L.subtitle}</p>
      </div>

      {/* Upload form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Bank */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">{L.bank}</label>
            <select
              value={bank}
              onChange={e => setBank(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {banks.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">{L.format}</label>
            <div className="flex gap-2">
              {(['csv', 'ofx'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    format === f
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Opening balance */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">{L.opening}</label>
            <input
              type="number"
              value={opening}
              onChange={e => setOpening(e.target.value)}
              placeholder="0"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>

          {/* Closing balance */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">{L.closing}</label>
            <input
              type="number"
              value={closing}
              onChange={e => setClosing(e.target.value)}
              placeholder="0"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        {/* Drop zone */}
        <label
          ref={dropRef}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed rounded-xl cursor-pointer transition ${
            dragOver
              ? 'bg-blue-500/10 border-blue-500 text-white'
              : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-blue-500 hover:text-white'
          }`}
        >
          <Upload className="w-8 h-8" />
          <span className="text-sm font-medium">{fileName || L.dragHere}</span>
          <span className="text-xs text-zinc-500">CSV / OFX / QFX</span>
          <input
            type="file"
            accept=".csv,.ofx,.qfx"
            onChange={handleFilePick}
            className="hidden"
          />
        </label>

        <label className="flex items-center gap-2 mt-4 text-sm text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={skipAi} onChange={e => setSkipAi(e.target.checked)} />
          <span>{L.skipAi}</span>
        </label>

        <button
          onClick={handleImport}
          disabled={!fileContent || loading}
          className="mt-4 w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {loading ? L.uploading : L.title}
        </button>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Import metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard icon={<FileText className="w-5 h-5" />} label={L.parsed}   value={result.parsed.total_lines} color="text-white" />
            <MetricCard icon={<CheckCircle2 className="w-5 h-5" />} label={L.inserted} value={result.persisted?.inserted ?? 0} color="text-emerald-400" />
            <MetricCard icon={<RefreshCw className="w-5 h-5" />}   label={L.skipped}  value={result.persisted?.skipped_duplicates ?? 0} color="text-zinc-400" />
            <MetricCard icon={<ArrowLeftRight className="w-5 h-5" />} label={L.transfers} value={result.transfers_detected ?? 0} color="text-purple-400" />
            <MetricCard icon={<ArrowRight className="w-5 h-5" />}    label={L.refunds}   value={result.refunds_detected ?? 0} color="text-teal-400" />
          </div>

          {/* Reconciliation */}
          {result.reconciliation && (
            <div className={`rounded-xl border p-4 ${
              result.reconciliation.ok
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-start gap-3">
                {result.reconciliation.ok
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
                  : <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />}
                <div className="flex-1">
                  <p className={`font-medium text-sm ${result.reconciliation.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                    {result.reconciliation.ok ? L.balances : L.notBalance}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">{result.reconciliation.note}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-xs">
                    <InfoCell label="Deposits"        value={fmtAmount(result.reconciliation.total_deposits)} />
                    <InfoCell label="Payments"        value={fmtAmount(result.reconciliation.total_payments)} />
                    <InfoCell label="Expected close"  value={fmtAmount(result.reconciliation.expected_closing)} />
                    <InfoCell label="Computed close"  value={fmtAmount(result.reconciliation.computed_closing)} className={result.reconciliation.ok ? 'text-emerald-400' : 'text-red-400'} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Classification stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {stats.map(s => (
                <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Transactions table */}
          {result.transactions.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <h2 className="text-sm font-medium text-white flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {L.transactions}
                </h2>
                <a
                  href="/dashboard/accounting/classify"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  {L.review} <ArrowRight className="w-3 h-3" />
                </a>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2">Account</th>
                      <th className="px-4 py-2 text-center">Confidence</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.transactions.map((tx, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-4 py-2 text-zinc-300">{tx.date}</td>
                        <td className="px-4 py-2 text-white max-w-[220px] truncate" title={tx.description}>{tx.description}</td>
                        <td className={`px-4 py-2 text-right font-mono ${tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fmtAmount(tx.amount)}
                        </td>
                        <td className="px-4 py-2 text-zinc-300 max-w-[180px] truncate">{tx.account_name || '—'}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceBadge(tx.confidence)}`}>
                            {(tx.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {tx.auto_approved
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            : <span className="text-xs text-amber-400">Review</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transfers detail */}
          {result.transfers && result.transfers.length > 0 && (
            <DetailList title={L.transfers} icon={<ArrowLeftRight className="w-4 h-4 text-purple-400" />}>
              {result.transfers.map((t, i) => (
                <li key={i} className="text-xs text-zinc-300">
                  <span className="text-purple-400">↔</span> {fmtAmount(t.amount)} · {t.date_out} → {t.date_in} · {t.description_out} ↔ {t.description_in}
                  <span className="ml-2 text-zinc-500">({(t.confidence * 100).toFixed(0)}%)</span>
                </li>
              ))}
            </DetailList>
          )}

          {/* Refunds detail */}
          {result.refunds && result.refunds.length > 0 && (
            <DetailList title={L.refunds} icon={<ArrowRight className="w-4 h-4 text-teal-400" />}>
              {result.refunds.map((r, i) => (
                <li key={i} className="text-xs text-zinc-300">
                  {r.vendor} · {fmtAmount(r.amount)} · {r.date_original} → {r.date_refund}
                  <span className="ml-2 text-zinc-500">({(r.confidence * 100).toFixed(0)}%)</span>
                </li>
              ))}
            </DetailList>
          )}

          {/* Parse warnings */}
          {result.parsed.parse_errors.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {L.parseWarnings}
              </p>
              <ul className="text-xs text-amber-300 space-y-1 max-h-40 overflow-y-auto">
                {result.parsed.parse_errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1">
        {icon} <span>{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}

function InfoCell({ label, value, className = 'text-zinc-300' }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className={`font-mono ${className}`}>{value}</p>
    </div>
  )
}

function DetailList({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-sm font-medium text-white mb-3 flex items-center gap-2">{icon} {title}</p>
      <ul className="space-y-1 max-h-48 overflow-y-auto">{children}</ul>
    </div>
  )
}
