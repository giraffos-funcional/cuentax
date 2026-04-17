'use client'

/**
 * USA — Bank Statement Import & Classify
 * Upload CSV/OFX bank statements, AI classifies transactions.
 */

import { useState, useCallback } from 'react'
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { useImportAndClassify } from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

const US_BANKS = [
  { value: 'chase', label: 'Chase' },
  { value: 'bofa', label: 'Bank of America' },
  { value: 'wells_fargo', label: 'Wells Fargo' },
  { value: 'generic_us', label: 'Other / Generic' },
]

interface ClassificationResult {
  parsed: { bank: string; format: string; total_lines: number; parse_errors: string[] }
  classification: {
    total: number; auto_approved: number; needs_review: number;
    unclassified: number; rule_matched: number
  }
  transactions: Array<{
    date: string; description: string; amount: number;
    account_name: string; category: string; confidence: number;
    reasoning: string; source: string; auto_approved: boolean
  }>
  errors: string[]
}

export default function ImportPage() {
  const { fmtCurrency } = useLocale()
  const { importAndClassify, loading, error } = useImportAndClassify()

  const [format, setFormat] = useState<'csv' | 'ofx'>('csv')
  const [bank, setBank] = useState('generic_us')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ClassificationResult | null>(null)

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setResult(null)

    const content = await file.text()
    const detectedFormat = file.name.endsWith('.ofx') || file.name.endsWith('.qfx') ? 'ofx' : 'csv'
    setFormat(detectedFormat)

    try {
      const res = await importAndClassify(content, detectedFormat, bank)
      setResult(res)
    } catch {
      // Error handled by hook
    }
  }, [bank, importAndClassify])

  const confidenceColor = (c: number) => {
    if (c >= 0.8) return 'text-emerald-400'
    if (c >= 0.5) return 'text-amber-400'
    return 'text-red-400'
  }

  const confidenceBadge = (c: number) => {
    if (c >= 0.8) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (c >= 0.5) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    return 'bg-red-500/20 text-red-400 border-red-500/30'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Import Bank Statement</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Upload a CSV or OFX file from your bank. AI will classify each transaction.
        </p>
      </div>

      {/* Upload Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Bank Selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Bank</label>
            <select
              value={bank}
              onChange={e => setBank(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {US_BANKS.map(b => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Format</label>
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

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">File</label>
            <label className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 border-dashed rounded-lg px-3 py-2 cursor-pointer hover:border-blue-500 transition">
              <Upload className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-400 truncate">
                {fileName || 'Choose file...'}
              </span>
              <input
                type="file"
                accept=".csv,.ofx,.qfx"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-3 text-blue-400 py-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Parsing and classifying transactions...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: result.classification.total, color: 'text-white' },
              { label: 'Auto-Approved', value: result.classification.auto_approved, color: 'text-emerald-400' },
              { label: 'Needs Review', value: result.classification.needs_review, color: 'text-amber-400' },
              { label: 'Unclassified', value: result.classification.unclassified, color: 'text-red-400' },
              { label: 'Rule Matched', value: result.classification.rule_matched, color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Transaction Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h2 className="text-sm font-medium text-white flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Classified Transactions
              </h2>
              <a
                href="/dashboard/accounting/classify"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                Review & Approve <ArrowRight className="w-3 h-3" />
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Account</th>
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2 text-center">Confidence</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.transactions.map((tx, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="px-4 py-2 text-zinc-300">{tx.date}</td>
                      <td className="px-4 py-2 text-white max-w-[200px] truncate">{tx.description}</td>
                      <td className={`px-4 py-2 text-right font-mono ${tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtCurrency(tx.amount)}
                      </td>
                      <td className="px-4 py-2 text-zinc-300">{tx.account_name}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">
                          {tx.category}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceBadge(tx.confidence)}`}>
                          {(tx.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {tx.auto_approved ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <span className="text-xs text-amber-400">Review</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Parse Errors */}
          {result.parsed.parse_errors.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-400 mb-2">Parse Warnings</p>
              <ul className="text-xs text-amber-300 space-y-1">
                {result.parsed.parse_errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
