/**
 * CUENTAX — Conciliacion Bancaria
 * Bank reconciliation — extracto vs movimientos sin conciliar with import, reconcile, and auto-reconcile.
 */

'use client'

import { useState } from 'react'
import {
  Download, Printer, CheckCircle2, Clock, Loader2, AlertCircle,
  Landmark, Upload, Wand2, Check, X, Pencil, Trash2, Plus, Save,
  FileUp, Search, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react'
import {
  useBankReconciliation,
  useJournals,
  useImportStatement,
  useReconcile,
  useAutoReconcile,
  useEditStatementLine,
  useDeleteStatementLine,
  useAddStatementLine,
  useImportBankFile,
  useAutoMatch,
  useApplyMatches,
} from '@/hooks'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
               'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-[var(--cx-active-icon)]" />
      <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Cargando conciliacion...</span>
    </div>
  )
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-xl bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]">
      <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
      <span className="text-sm text-[var(--cx-status-error-text)]">{message ?? 'Error cargando conciliacion'}</span>
    </div>
  )
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Clock size={28} className="text-[var(--cx-text-muted)]" />
      <p className="text-sm text-[var(--cx-text-muted)]">{message}</p>
    </div>
  )
}

function TableHeader({ columns }: { columns: string[] }) {
  return (
    <div className={`grid gap-2 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]`}
         style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map(col => (
        <div key={col} className={col === 'Monto' ? 'text-right' : ''}>{col}</div>
      ))}
    </div>
  )
}

// ── Import Cartola Modal ──────────────────────────────────────
function ImportCartolaModal({
  bankJournals,
  isSaving,
  isImportingFile,
  onImport,
  onImportFile,
  onClose,
}: {
  bankJournals: any[]
  isSaving: boolean
  isImportingFile: boolean
  onImport: (payload: unknown) => Promise<void>
  onImportFile: (payload: { content: string; format: 'ofx' | 'csv'; bank?: string; journal_id: number }) => Promise<void>
  onClose: () => void
}) {
  const [mode, setMode] = useState<'file' | 'manual'>('file')
  // File import state
  const [fileJournalId, setFileJournalId] = useState('')
  const [fileFormat, setFileFormat] = useState<'ofx' | 'csv'>('csv')
  const [fileBank, setFileBank] = useState('generic')
  const [fileContent, setFileContent] = useState('')
  const [fileName, setFileName] = useState('')
  // Manual import state
  const [journalId, setJournalId] = useState('')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [balanceStart, setBalanceStart] = useState('')
  const [balanceEnd, setBalanceEnd] = useState('')
  const [linesText, setLinesText] = useState('')
  const [parseError, setParseError] = useState('')

  const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    // Auto-detect format from extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'ofx' || ext === 'qfx') setFileFormat('ofx')
    else setFileFormat('csv')

    const reader = new FileReader()
    reader.onload = (ev) => {
      setFileContent(ev.target?.result as string ?? '')
    }
    reader.readAsText(file)
  }

  const handleFileImport = async () => {
    setParseError('')
    if (!fileJournalId || !fileContent) {
      setParseError('Selecciona una cuenta y un archivo')
      return
    }
    await onImportFile({
      content: fileContent,
      format: fileFormat,
      bank: fileFormat === 'csv' ? fileBank : undefined,
      journal_id: Number(fileJournalId),
    })
  }

  const handleManualImport = async () => {
    setParseError('')
    if (!journalId || !name || !date) {
      setParseError('Completa los campos obligatorios')
      return
    }

    const rawLines = linesText.trim().split('\n').filter(l => l.trim())
    const parsedLines: { date: string; description: string; amount: number }[] = []

    for (let i = 0; i < rawLines.length; i++) {
      const parts = rawLines[i].split('|').map(p => p.trim())
      if (parts.length < 3) {
        setParseError(`Linea ${i + 1}: formato invalido. Usa: fecha|descripcion|monto`)
        return
      }
      const amount = Number(parts[2])
      if (isNaN(amount)) {
        setParseError(`Linea ${i + 1}: monto invalido "${parts[2]}"`)
        return
      }
      parsedLines.push({
        date: parts[0],
        description: parts[1],
        amount,
      })
    }

    await onImport({
      journal_id: Number(journalId),
      name,
      date,
      balance_start: Number(balanceStart) || 0,
      balance_end: Number(balanceEnd) || 0,
      lines: parsedLines,
    })
  }

  const isBusy = isSaving || isImportingFile

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">Importar Cartola</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--cx-bg-elevated)] mb-5">
          <button
            onClick={() => setMode('file')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              mode === 'file'
                ? 'bg-[var(--cx-bg-card)] text-[var(--cx-text-primary)] shadow-sm'
                : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text-secondary)]'
            }`}
          >
            <FileUp size={13} /> Archivo (OFX/CSV)
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              mode === 'manual'
                ? 'bg-[var(--cx-bg-card)] text-[var(--cx-text-primary)] shadow-sm'
                : 'text-[var(--cx-text-muted)] hover:text-[var(--cx-text-secondary)]'
            }`}
          >
            <Pencil size={13} /> Manual
          </button>
        </div>

        {mode === 'file' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Cuenta Bancaria *</label>
              <select value={fileJournalId} onChange={e => setFileJournalId(e.target.value)} className="input-field text-sm w-full">
                <option value="">Seleccionar cuenta...</option>
                {bankJournals.map((j: any) => (
                  <option key={j.id} value={j.id}>{j.nombre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Formato</label>
                <select value={fileFormat} onChange={e => setFileFormat(e.target.value as 'ofx' | 'csv')} className="input-field text-sm w-full">
                  <option value="csv">CSV</option>
                  <option value="ofx">OFX / QFX</option>
                </select>
              </div>
              {fileFormat === 'csv' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Banco</label>
                  <select value={fileBank} onChange={e => setFileBank(e.target.value)} className="input-field text-sm w-full">
                    <option value="generic">Generico</option>
                    <option value="bancoestado">BancoEstado</option>
                    <option value="bci">BCI</option>
                    <option value="santander">Santander</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Archivo de Cartola *</label>
              <label className="flex flex-col items-center justify-center gap-2 py-6 px-4 border-2 border-dashed border-[var(--cx-border-light)] rounded-xl cursor-pointer hover:border-[var(--cx-active-icon)] hover:bg-[var(--cx-hover-bg)] transition-colors">
                <FileUp size={24} className="text-[var(--cx-text-muted)]" />
                {fileName ? (
                  <span className="text-sm text-[var(--cx-text-primary)] font-medium">{fileName}</span>
                ) : (
                  <span className="text-xs text-[var(--cx-text-muted)]">Seleccionar archivo .csv, .ofx o .qfx</span>
                )}
                <input
                  type="file"
                  accept=".csv,.ofx,.qfx,.txt"
                  onChange={handleFileRead}
                  className="hidden"
                />
              </label>
              {fileContent && (
                <p className="text-xs text-[var(--cx-text-muted)] mt-1">
                  {fileContent.split('\n').filter(l => l.trim()).length} lineas detectadas
                </p>
              )}
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Cuenta Bancaria *</label>
              <select value={journalId} onChange={e => setJournalId(e.target.value)} className="input-field text-sm w-full">
                <option value="">Seleccionar cuenta...</option>
                {bankJournals.map((j: any) => (
                  <option key={j.id} value={j.id}>{j.nombre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Nombre *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Cartola Marzo 2026" className="input-field text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field text-sm w-full" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Saldo Inicial</label>
                <input type="number" value={balanceStart} onChange={e => setBalanceStart(e.target.value)} placeholder="0" className="input-field text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Saldo Final</label>
                <input type="number" value={balanceEnd} onChange={e => setBalanceEnd(e.target.value)} placeholder="0" className="input-field text-sm w-full" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Lineas de la Cartola</label>
              <p className="text-xs text-[var(--cx-text-muted)] mb-2">
                Formato: <span className="font-mono bg-[var(--cx-bg-elevated)] px-1 py-0.5 rounded">fecha|descripcion|monto</span> (una linea por movimiento)
              </p>
              <textarea
                rows={6}
                value={linesText}
                onChange={e => setLinesText(e.target.value)}
                placeholder={"2026-03-01|Pago proveedor XYZ|-150000\n2026-03-02|Cobro cliente ABC|500000\n2026-03-05|Comision bancaria|-5000"}
                className="input-field resize-none font-mono text-xs"
              />
            </div>
          </div>
        )}

        {parseError && (
          <div className="flex items-center gap-2 text-xs text-[var(--cx-status-error-text)] mt-4">
            <AlertCircle size={12} />
            {parseError}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          {mode === 'file' ? (
            <button
              onClick={handleFileImport}
              disabled={isBusy || !fileJournalId || !fileContent}
              className="btn-primary flex-1 justify-center"
            >
              {isImportingFile ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              Importar Archivo
            </button>
          ) : (
            <button
              onClick={handleManualImport}
              disabled={isBusy || !journalId || !name || !date}
              className="btn-primary flex-1 justify-center"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Importar Manual
            </button>
          )}
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Auto-Match Suggestions Panel ──────────────────────────────
function AutoMatchPanel({
  suggestions,
  extracto,
  sinConciliar,
  isLoading,
  isApplying,
  onApply,
}: {
  suggestions: Array<{ statement_line_id: number; move_line_id: number; confidence: number; reason: string }>
  extracto: any[]
  sinConciliar: any[]
  isLoading: boolean
  isApplying: boolean
  onApply: (matches: Array<{ statement_line_id: number; move_line_id: number }>) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(suggestions.map((_, i) => i)))
  const [expanded, setExpanded] = useState(true)

  // Update selection when suggestions change
  const prevLen = selected.size
  if (suggestions.length > 0 && prevLen === 0 && !isLoading) {
    // Auto-select all on fresh load
    const allIdxs = new Set(suggestions.map((_, i) => i))
    if (allIdxs.size !== selected.size) {
      setSelected(allIdxs)
    }
  }

  const toggleSelect = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(suggestions.map((_, i) => i)))
  const selectNone = () => setSelected(new Set())

  const handleApply = async () => {
    const matches = suggestions
      .filter((_, i) => selected.has(i))
      .map(s => ({ statement_line_id: s.statement_line_id, move_line_id: s.move_line_id }))
    await onApply(matches)
  }

  // Helper to find statement/move info by id
  const getStLine = (id: number) => extracto.find((l: any) => l.id === id)
  const getMvLine = (id: number) => sinConciliar.find((l: any) => l.id === id)

  const confidenceColor = (c: number) => {
    if (c >= 90) return 'text-[var(--cx-status-ok-text)] bg-[var(--cx-status-ok-bg)]'
    if (c >= 80) return 'text-blue-700 bg-blue-50'
    return 'text-[var(--cx-status-warn-text)] bg-[var(--cx-status-warn-bg)]'
  }

  if (suggestions.length === 0 && !isLoading) return null

  return (
    <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 border-b border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)] flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--cx-active-icon)]" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">
            Sugerencias de Conciliacion
          </h3>
          {suggestions.length > 0 && (
            <span className="text-xs font-bold bg-[var(--cx-active-bg)] text-[var(--cx-active-icon)] px-2 py-0.5 rounded-full">
              {suggestions.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-[var(--cx-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--cx-text-muted)]" />}
      </button>

      {expanded && (
        <div>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[var(--cx-active-icon)]" />
              <span className="ml-2 text-sm text-[var(--cx-text-secondary)]">Buscando coincidencias...</span>
            </div>
          )}

          {!isLoading && suggestions.length > 0 && (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
                <div className="flex items-center gap-3 text-xs text-[var(--cx-text-muted)]">
                  <button onClick={selectAll} className="hover:text-[var(--cx-active-icon)] transition-colors">Seleccionar todo</button>
                  <span>|</span>
                  <button onClick={selectNone} className="hover:text-[var(--cx-active-icon)] transition-colors">Ninguno</button>
                  <span className="text-[var(--cx-text-muted)]">({selected.size} de {suggestions.length})</span>
                </div>
                <button
                  onClick={handleApply}
                  disabled={selected.size === 0 || isApplying}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Aplicar Seleccionados
                </button>
              </div>

              {/* Suggestion rows */}
              <div className="divide-y divide-[var(--cx-border-light)]">
                {suggestions.map((s, i) => {
                  const stLine = getStLine(s.statement_line_id)
                  const mvLine = getMvLine(s.move_line_id)
                  return (
                    <div
                      key={i}
                      className={`px-4 py-3 hover:bg-[var(--cx-hover-bg)] transition-colors ${
                        selected.has(i) ? 'bg-[var(--cx-active-bg)]' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggleSelect(i)}
                          className="mt-1 w-3.5 h-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${confidenceColor(s.confidence)}`}>
                              {s.confidence}%
                            </span>
                            <span className="text-xs text-[var(--cx-text-muted)]">{s.reason}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-[var(--cx-bg-elevated)] rounded-lg p-2">
                              <p className="text-[10px] uppercase tracking-widest text-[var(--cx-text-muted)] mb-1">Extracto</p>
                              <p className="text-[var(--cx-text-primary)] truncate">{stLine?.referencia ?? `#${s.statement_line_id}`}</p>
                              <p className="text-[var(--cx-text-secondary)] font-mono tabular-nums">{stLine ? formatCLP(stLine.monto) : '-'}</p>
                            </div>
                            <div className="bg-[var(--cx-bg-elevated)] rounded-lg p-2">
                              <p className="text-[10px] uppercase tracking-widest text-[var(--cx-text-muted)] mb-1">Movimiento</p>
                              <p className="text-[var(--cx-text-primary)] truncate">{mvLine?.documento ?? `#${s.move_line_id}`}</p>
                              <p className="text-[var(--cx-text-secondary)] font-mono tabular-nums">{mvLine ? formatCLP(mvLine.monto) : '-'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Extracto Bancario panel ────────────────────────────────────
function ExtractoPanel({
  extracto,
  selectedIds,
  onToggle,
  onEdit,
  onDelete,
}: {
  extracto: { id?: number; fecha: string; referencia: string; monto: number; conciliado: boolean }[]
  selectedIds: Set<number>
  onToggle: (id: number) => void
  onEdit: (row: any) => void
  onDelete: (id: number) => void
}) {
  if (extracto.length === 0) return <EmptyPanel message="Sin movimientos en el extracto" />

  return (
    <div className="divide-y divide-[var(--cx-border-light)]">
      {extracto.map((row, i) => {
        const rowId = row.id ?? i
        const isSelected = selectedIds.has(rowId)
        return (
          <div key={i} className={`grid gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors ${
            isSelected ? 'bg-[var(--cx-active-bg)]' : ''
          }`} style={{ gridTemplateColumns: '2fr 3fr 2fr auto auto' }}>
            <div className="flex items-center">
              {!row.conciliado && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(rowId)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 mr-2"
                />
              )}
              <span className="text-[var(--cx-text-secondary)] text-xs font-mono">{row.fecha}</span>
            </div>
            <div className="text-[var(--cx-text-primary)] truncate">{row.referencia}</div>
            <div className="text-right text-[var(--cx-text-primary)] tabular-nums">{formatCLP(row.monto)}</div>
            <div className="flex justify-center items-center">
              {row.conciliado
                ? <CheckCircle2 size={15} className="text-[var(--cx-status-ok-text)]" />
                : <Clock size={15} className="text-[var(--cx-text-muted)]" />
              }
            </div>
            <div className="flex items-center gap-1">
              {!row.conciliado && row.id && (
                <>
                  <button
                    onClick={() => onEdit(row)}
                    className="p-1 rounded hover:bg-[var(--cx-hover-bg)] text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] transition-colors"
                    title="Editar"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(row.id!)}
                    className="p-1 rounded hover:bg-red-50 text-[var(--cx-text-muted)] hover:text-red-500 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Sin Conciliar panel ────────────────────────────────────────
function SinConciliarPanel({ items }: { items: { fecha: string; documento: string; descripcion: string; monto: number }[] }) {
  if (items.length === 0) return <EmptyPanel message="Sin movimientos pendientes" />

  return (
    <div className="divide-y divide-[var(--cx-border-light)]">
      {items.map((row, i) => (
        <div key={i} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm hover:bg-[var(--cx-hover-bg)] transition-colors">
          <div className="text-[var(--cx-text-secondary)] text-xs font-mono">{row.fecha}</div>
          <div className="text-[var(--cx-text-primary)] truncate font-mono text-xs">{row.documento}</div>
          <div className="text-[var(--cx-text-secondary)] truncate text-xs">{row.descripcion}</div>
          <div className="text-right text-[var(--cx-text-primary)] tabular-nums">{formatCLP(row.monto)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Edit Line Modal ──────────────────────────────────────────
function EditLineModal({
  line,
  isSaving,
  onSave,
  onClose,
}: {
  line: { id: number; fecha: string; referencia: string; monto: number }
  isSaving: boolean
  onSave: (id: number, data: { date?: string; payment_ref?: string; amount?: number }) => Promise<void>
  onClose: () => void
}) {
  const [fecha, setFecha] = useState(line.fecha)
  const [referencia, setReferencia] = useState(line.referencia)
  const [monto, setMonto] = useState(String(line.monto))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">Editar Linea</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Referencia</label>
            <input value={referencia} onChange={e => setReferencia(e.target.value)} className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Monto</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} className="input-field text-sm w-full" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => onSave(line.id, { date: fecha, payment_ref: referencia, amount: Number(monto) })}
            disabled={isSaving}
            className="btn-primary flex-1 justify-center"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── Add Line Modal ──────────────────────────────────────────
function AddLineModal({
  journalId,
  isSaving,
  onSave,
  onClose,
}: {
  journalId: number
  isSaving: boolean
  onSave: (data: { journal_id: number; date: string; payment_ref: string; amount: number }) => Promise<void>
  onClose: () => void
}) {
  const [fecha, setFecha] = useState('')
  const [referencia, setReferencia] = useState('')
  const [monto, setMonto] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-[var(--cx-text-primary)]">Agregar Linea</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Fecha *</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Referencia *</label>
            <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ej: PAGO PROVEEDOR XYZ" className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--cx-text-secondary)] mb-1">Monto *</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="Negativo = cargo, Positivo = abono" className="input-field text-sm w-full" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => onSave({ journal_id: journalId, date: fecha, payment_ref: referencia, amount: Number(monto) })}
            disabled={isSaving || !fecha || !referencia || !monto}
            className="btn-primary flex-1 justify-center"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Agregar
          </button>
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// ── CSV export helper ──────────────────────────────────────────
const exportCSV = (data: any[], filename: string) => {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────
export default function ConciliacionPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [journalId, setJournalId] = useState<number | null>(null)

  // Modal & action state
  const [showImport, setShowImport] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isReconciling, setIsReconciling] = useState(false)
  const [isAutoReconciling, setIsAutoReconciling] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [editingLine, setEditingLine] = useState<any | null>(null)
  const [showAddLine, setShowAddLine] = useState(false)
  const [isSavingLine, setIsSavingLine] = useState(false)
  const [matchSuggestions, setMatchSuggestions] = useState<Array<{ statement_line_id: number; move_line_id: number; confidence: number; reason: string }>>([])
  const [isMatching, setIsMatching] = useState(false)
  const [isApplyingMatches, setIsApplyingMatches] = useState(false)

  const { journals } = useJournals()
  const bankJournals = journals.filter((j: any) => j.tipo === 'bank')

  const { extracto, sin_conciliar, total_extracto, total_sin_conciliar, isLoading, error } =
    useBankReconciliation(journalId, month, year)

  const { importar } = useImportStatement()
  const { reconcile } = useReconcile()
  const { autoReconcile } = useAutoReconcile()
  const { editar } = useEditStatementLine()
  const { eliminar } = useDeleteStatementLine()
  const { agregar } = useAddStatementLine()
  const { importFile } = useImportBankFile()
  const { findMatches: findMatchesTrigger } = useAutoMatch()
  const { apply: applyMatchesTrigger } = useApplyMatches()

  const diferencia = total_extracto - total_sin_conciliar
  const cuadra = diferencia === 0

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleImport = async (payload: unknown) => {
    setIsImporting(true)
    setActionMessage(null)
    try {
      await importar(payload)
      setShowImport(false)
      setActionMessage({ type: 'ok', text: 'Cartola importada exitosamente' })
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error al importar cartola' })
    } finally {
      setIsImporting(false)
    }
  }

  const handleReconcile = async () => {
    if (selectedIds.size === 0) return
    setIsReconciling(true)
    setActionMessage(null)
    try {
      const result = await reconcile(Array.from(selectedIds))
      setSelectedIds(new Set())
      setActionMessage({ type: 'ok', text: `${result?.reconciled ?? selectedIds.size} lineas conciliadas` })
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error al conciliar' })
    } finally {
      setIsReconciling(false)
    }
  }

  const handleAutoReconcile = async () => {
    if (!journalId) return
    setIsAutoReconciling(true)
    setActionMessage(null)
    try {
      const result = await autoReconcile(journalId)
      setActionMessage({ type: 'ok', text: `Auto-conciliacion completada: ${result?.reconciled ?? 0} lineas conciliadas` })
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error en auto-conciliacion' })
    } finally {
      setIsAutoReconciling(false)
    }
  }

  const handleEditLine = async (id: number, data: { date?: string; payment_ref?: string; amount?: number }) => {
    setIsSavingLine(true)
    setActionMessage(null)
    try {
      await editar(id, data)
      setEditingLine(null)
      setActionMessage({ type: 'ok', text: 'Linea actualizada' })
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error al editar linea' })
    } finally {
      setIsSavingLine(false)
    }
  }

  const handleDeleteLine = async (id: number) => {
    if (!confirm('¿Eliminar esta linea del extracto?')) return
    setActionMessage(null)
    try {
      await eliminar(id)
      setActionMessage({ type: 'ok', text: 'Linea eliminada' })
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error al eliminar linea' })
    }
  }

  const handleAddLine = async (data: { journal_id: number; date: string; payment_ref: string; amount: number }) => {
    setIsSavingLine(true)
    setActionMessage(null)
    try {
      await agregar(data)
      setShowAddLine(false)
      setActionMessage({ type: 'ok', text: 'Linea agregada' })
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error al agregar linea' })
    } finally {
      setIsSavingLine(false)
    }
  }

  const handleImportFile = async (payload: { content: string; format: 'ofx' | 'csv'; bank?: string; journal_id: number }) => {
    setActionMessage(null)
    try {
      const result = await importFile(payload)
      setShowImport(false)
      setActionMessage({ type: 'ok', text: `Archivo importado: ${result?.created ?? 0} de ${result?.parsed ?? 0} lineas creadas` })
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error al importar archivo' })
    }
  }

  const handleAutoMatch = async () => {
    if (!journalId) return
    setIsMatching(true)
    setActionMessage(null)
    setMatchSuggestions([])
    try {
      const result = await findMatchesTrigger({ journal_id: journalId, mes: month, year })
      setMatchSuggestions(result?.suggestions ?? [])
      const count = result?.suggestions?.length ?? 0
      if (count === 0) {
        setActionMessage({ type: 'ok', text: 'No se encontraron coincidencias automaticas' })
      } else {
        setActionMessage({ type: 'ok', text: `${count} coincidencias encontradas (confianza promedio: ${result?.avg_confidence ?? 0}%)` })
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error buscando coincidencias' })
    } finally {
      setIsMatching(false)
    }
  }

  const handleApplyMatches = async (matches: Array<{ statement_line_id: number; move_line_id: number }>) => {
    setIsApplyingMatches(true)
    setActionMessage(null)
    try {
      const result = await applyMatchesTrigger(matches)
      setMatchSuggestions([])
      setActionMessage({ type: 'ok', text: `${result?.reconciled ?? 0} de ${result?.total ?? 0} lineas conciliadas` })
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message ?? 'Error aplicando conciliaciones' })
    } finally {
      setIsApplyingMatches(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Conciliacion Bancaria</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">
            Extracto bancario vs movimientos contables · {MESES[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={journalId ?? ''}
            onChange={e => setJournalId(e.target.value ? Number(e.target.value) : null)}
            className="input-field py-2 text-sm w-auto"
          >
            <option value="">Seleccionar cuenta...</option>
            {bankJournals.map((j: any) => (
              <option key={j.id} value={j.id}>{j.nombre}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="input-field py-2 text-sm w-auto"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowImport(true)} className="btn-primary">
            <Upload size={13} /> Importar Cartola
          </button>
          {journalId && (
            <button onClick={() => setShowAddLine(true)} className="btn-secondary flex items-center gap-2">
              <Plus size={13} /> Agregar Linea
            </button>
          )}
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => window.print()}
          >
            <Printer size={13} /> Imprimir
          </button>
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={() => exportCSV(extracto ?? [], 'conciliacion-extracto')}
          >
            <Download size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* Action message */}
      {actionMessage && (
        <div className={`flex items-center gap-2 p-4 rounded-xl animate-fade-in ${
          actionMessage.type === 'ok'
            ? 'bg-[var(--cx-status-ok-bg)] border border-[var(--cx-status-ok-border)]'
            : 'bg-[var(--cx-status-error-bg)] border border-[var(--cx-status-error-border)]'
        }`}>
          {actionMessage.type === 'ok'
            ? <CheckCircle2 size={16} className="text-[var(--cx-status-ok-text)]" />
            : <AlertCircle size={16} className="text-[var(--cx-status-error-text)]" />
          }
          <span className={`text-sm ${
            actionMessage.type === 'ok' ? 'text-[var(--cx-status-ok-text)]' : 'text-[var(--cx-status-error-text)]'
          }`}>{actionMessage.text}</span>
        </div>
      )}

      {/* No journal selected */}
      {!journalId && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--cx-bg-elevated)] border border-[var(--cx-border-light)] flex items-center justify-center">
            <Landmark size={28} className="text-[var(--cx-text-muted)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--cx-text-primary)]">Selecciona una cuenta bancaria</p>
            <p className="text-xs text-[var(--cx-text-muted)] mt-1">
              Elige una cuenta del selector para ver la conciliacion del periodo
            </p>
          </div>
        </div>
      )}

      {/* Data */}
      {journalId && (
        <>
          {isLoading && <LoadingState />}
          {error && <ErrorState message={error?.message} />}

          {!isLoading && !error && (
            <div className="space-y-5">
              {/* Reconcile action bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleReconcile}
                  disabled={selectedIds.size === 0 || isReconciling}
                  className="btn-primary"
                >
                  {isReconciling ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Conciliar Seleccion ({selectedIds.size})
                </button>
                <button
                  onClick={handleAutoReconcile}
                  disabled={isAutoReconciling}
                  className="btn-secondary flex items-center gap-2"
                >
                  {isAutoReconciling ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                  Auto-Conciliar
                </button>
                <button
                  onClick={handleAutoMatch}
                  disabled={isMatching}
                  className="btn-secondary flex items-center gap-2"
                >
                  {isMatching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  Buscar Coincidencias
                </button>
              </div>

              {/* Two-panel layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Extracto Bancario */}
                <div className="card border border-[var(--cx-border-light)] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--cx-border-light)] bg-[var(--cx-bg-elevated)]">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">
                      Extracto Bancario
                    </h3>
                  </div>
                  <TableHeader columns={['Fecha', 'Referencia', 'Monto', 'Estado', '']} />
                  <ExtractoPanel
                    extracto={extracto ?? []}
                    selectedIds={selectedIds}
                    onToggle={toggleSelection}
                    onEdit={(row) => setEditingLine(row)}
                    onDelete={handleDeleteLine}
                  />
                </div>

                {/* Movimientos Sin Conciliar */}
                <div className="card border border-[var(--cx-status-warn-border)] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--cx-border-light)] bg-[var(--cx-status-warn-bg)]">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--cx-text-muted)]">
                      Movimientos Sin Conciliar
                    </h3>
                  </div>
                  <TableHeader columns={['Fecha', 'Documento', 'Descripcion', 'Monto']} />
                  <SinConciliarPanel items={sin_conciliar ?? []} />
                </div>
              </div>

              {/* Auto-match suggestions panel */}
              {(matchSuggestions.length > 0 || isMatching) && (
                <AutoMatchPanel
                  suggestions={matchSuggestions}
                  extracto={extracto}
                  sinConciliar={sin_conciliar}
                  isLoading={isMatching}
                  isApplying={isApplyingMatches}
                  onApply={handleApplyMatches}
                />
              )}

              {/* Summary bar */}
              <div className={`grid grid-cols-3 gap-4 p-4 rounded-2xl border ${
                cuadra
                  ? 'bg-[var(--cx-status-ok-bg)] border-[var(--cx-status-ok-border)]'
                  : 'bg-[var(--cx-status-warn-bg)] border-[var(--cx-status-warn-border)]'
              }`}>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--cx-text-muted)] mb-1">
                    Total Extracto
                  </p>
                  <p className="text-base font-bold text-[var(--cx-text-primary)] tabular-nums">
                    {formatCLP(total_extracto ?? 0)}
                  </p>
                </div>
                <div className="text-center border-x border-[var(--cx-border-light)]">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--cx-text-muted)] mb-1">
                    Total Sin Conciliar
                  </p>
                  <p className="text-base font-bold text-[var(--cx-status-warn-text)] tabular-nums">
                    {formatCLP(total_sin_conciliar ?? 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--cx-text-muted)] mb-1">
                    Diferencia
                  </p>
                  <p className={`text-base font-bold tabular-nums ${
                    cuadra
                      ? 'text-[var(--cx-status-ok-text)]'
                      : 'text-[var(--cx-status-error-text)]'
                  }`}>
                    {cuadra ? '-' : formatCLP(Math.abs(diferencia))}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportCartolaModal
          bankJournals={bankJournals}
          isSaving={isImporting}
          isImportingFile={false}
          onImport={handleImport}
          onImportFile={handleImportFile}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Edit Line Modal */}
      {editingLine && (
        <EditLineModal
          line={editingLine}
          isSaving={isSavingLine}
          onSave={handleEditLine}
          onClose={() => setEditingLine(null)}
        />
      )}

      {/* Add Line Modal */}
      {showAddLine && journalId && (
        <AddLineModal
          journalId={journalId}
          isSaving={isSavingLine}
          onSave={handleAddLine}
          onClose={() => setShowAddLine(false)}
        />
      )}
    </div>
  )
}
