'use client'

/**
 * USA — Review & Approve AI Classifications
 * Review pending classifications, approve/reject, correct accounts.
 */

import { useState } from 'react'
import { CheckCircle2, XCircle, ChevronDown, Loader2, CheckCheck } from 'lucide-react'
import { useClassifications, useApproveClassification, useBulkApprove } from '@/hooks'
import { useLocale } from '@/contexts/locale-context'

export default function ClassifyPage() {
  const { fmtCurrency } = useLocale()
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'all'>('pending')
  const { classifications, total, isLoading, mutate } = useClassifications(statusFilter)
  const { approve } = useApproveClassification()
  const { bulkApprove } = useBulkApprove()

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [approving, setApproving] = useState(false)

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === classifications.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(classifications.map((c: any) => c.id)))
    }
  }

  const handleApprove = async (id: number) => {
    await approve(id)
    mutate()
  }

  const handleBulkApprove = async () => {
    if (selected.size === 0) return
    setApproving(true)
    try {
      await bulkApprove(Array.from(selected))
      setSelected(new Set())
      mutate()
    } finally {
      setApproving(false)
    }
  }

  const confidenceBadge = (c: number) => {
    if (c >= 0.8) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (c >= 0.5) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    return 'bg-red-500/20 text-red-400 border-red-500/30'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Review Classifications</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Approve or correct AI-classified transactions before generating journal entries.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="all">All</option>
          </select>

          {/* Bulk Approve */}
          {selected.size > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={approving}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
              Approve {selected.size} selected
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-sm text-zinc-400">
          Showing <span className="text-white font-medium">{total}</span> classifications
          {statusFilter !== 'all' && <> with status <span className="text-white font-medium">{statusFilter}</span></>}
        </p>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : classifications.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          No classifications to review. Import a bank statement first.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === classifications.length && classifications.length > 0}
                    onChange={selectAll}
                    className="rounded border-zinc-600"
                  />
                </th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-center">Confidence</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {classifications.map((c: any) => (
                <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="rounded border-zinc-600"
                    />
                  </td>
                  <td className="px-4 py-2 text-zinc-300">{c.date}</td>
                  <td className="px-4 py-2 text-white max-w-[180px] truncate" title={c.description}>
                    {c.description}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${
                    Number(c.amount) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {fmtCurrency(Number(c.amount))}
                  </td>
                  <td className="px-4 py-2 text-zinc-300">{c.account_name || '-'}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">
                      {c.category || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${confidenceBadge(c.confidence ?? 0)}`}>
                      {((c.confidence ?? 0) * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs ${c.source === 'rule' ? 'text-blue-400' : 'text-zinc-400'}`}>
                      {c.source}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {!c.approved ? (
                      <button
                        onClick={() => handleApprove(c.id)}
                        className="text-emerald-400 hover:text-emerald-300 p-1"
                        title="Approve"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    ) : c.has_journal_entry ? (
                      <span className="text-xs text-zinc-500">Posted</span>
                    ) : (
                      <span className="text-xs text-emerald-400">Approved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
