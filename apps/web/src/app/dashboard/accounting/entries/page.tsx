'use client'

/**
 * USA — Generate & Review Journal Entries
 * Generate draft journal entries from approved classifications, then review.
 */

import { useState } from 'react'
import { BookOpen, Loader2, Play, CheckCircle2, AlertCircle } from 'lucide-react'
import { useGenerateJournalEntries, useJournals, useClassifications } from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

export default function EntriesPage() {
  const { fmtCurrency } = useLocale()
  const { generate, loading: generating } = useGenerateJournalEntries()
  const { classifications: approved } = useClassifications('approved')
  const { journals } = useJournals()

  const [bankJournalId, setBankJournalId] = useState<number>(0)
  const [bankAccountId, setBankAccountId] = useState<number>(0)
  const [result, setResult] = useState<{ created: number; failed: number; entries: any[]; errors: string[] } | null>(null)

  const pendingApproved = approved.filter((c: any) => !c.has_journal_entry)

  const handleGenerate = async () => {
    if (!bankJournalId || !bankAccountId) return
    try {
      const res = await generate(bankJournalId, bankAccountId)
      setResult(res)
    } catch {
      // handled by hook
    }
  }

  const bankJournals = (journals ?? []).filter((j: any) =>
    j.type === 'bank' || j.type === 'cash'
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Generate Journal Entries</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Create draft journal entries in your accounting system from approved classifications.
        </p>
      </div>

      {/* Config Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Bank Journal */}
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Bank Journal</label>
            <select
              value={bankJournalId}
              onChange={e => setBankJournalId(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value={0}>Select journal...</option>
              {bankJournals.map((j: any) => (
                <option key={j.id} value={j.id}>{j.name} ({j.code})</option>
              ))}
            </select>
          </div>

          {/* Bank Account ID */}
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Bank Account (Odoo ID)</label>
            <input
              type="number"
              value={bankAccountId || ''}
              onChange={e => setBankAccountId(Number(e.target.value))}
              placeholder="e.g., 1000"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>

          {/* Pending Count */}
          <div className="flex flex-col justify-end">
            <p className="text-sm text-zinc-400">
              <span className="text-white font-bold text-lg">{pendingApproved.length}</span>{' '}
              approved classifications ready to post
            </p>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !bankJournalId || !bankAccountId || pendingApproved.length === 0}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Generate {pendingApproved.length} Journal Entries
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-medium text-white mb-4">Generation Results</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-400">{result.created}</p>
              <p className="text-xs text-emerald-300">Created</p>
            </div>
            {result.failed > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-400">{result.failed}</p>
                <p className="text-xs text-red-300">Failed</p>
              </div>
            )}
          </div>

          {result.entries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">Created entries (Odoo IDs):</p>
              <div className="flex flex-wrap gap-2">
                {result.entries.map((e: any) => (
                  <span key={e.odoo_move_id} className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300">
                    #{e.odoo_move_id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs font-medium text-red-400 mb-1">Errors:</p>
              <ul className="text-xs text-red-300 space-y-1">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
