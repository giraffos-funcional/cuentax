/**
 * Bell de notificaciones in-app — badge con count + dropdown.
 * Consume /api/v1/notifications/unread-count cada 60s y la lista
 * completa solo cuando el usuario abre el panel.
 */
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Bell, Check, X, AlertTriangle, Info, AlertCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { apiClient } from '@/lib/api-client'

interface Notification {
  id: number
  level: 'info' | 'warning' | 'error' | 'success'
  title: string
  body: string | null
  href: string | null
  read_at: string | null
  created_at: string
}

const POLL_MS = 60_000

const levelIcon: Record<string, React.ReactNode> = {
  info:    <Info        className="w-4 h-4 text-blue-600" />,
  success: <CheckCircle2 className="w-4 h-4 text-green-600" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-600" />,
  error:   <AlertCircle className="w-4 h-4 text-red-600" />,
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<Notification[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const fetchCount = useCallback(async () => {
    try {
      const r = await apiClient.get<{ count: number }>('/api/v1/notifications/unread-count')
      setUnread(r.data.count)
    } catch { /* silent */ }
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiClient.get<{ data: Notification[] }>('/api/v1/notifications?limit=20')
      setItems(r.data.data)
    } catch { setItems([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchCount()
    const id = setInterval(fetchCount, POLL_MS)
    return () => clearInterval(id)
  }, [fetchCount])

  useEffect(() => {
    if (!open) return
    fetchItems()
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    setTimeout(() => document.addEventListener('click', onClick), 0)
    return () => document.removeEventListener('click', onClick)
  }, [open, fetchItems])

  const markRead = async (id: number) => {
    await apiClient.post(`/api/v1/notifications/${id}/read`)
    setItems((prev) => prev?.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n) ?? null)
    setUnread((u) => Math.max(0, u - 1))
  }

  const markAllRead = async () => {
    await apiClient.post('/api/v1/notifications/read-all')
    setItems((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null)
    setUnread(0)
  }

  const archive = async (id: number) => {
    await apiClient.delete(`/api/v1/notifications/${id}`)
    setItems((prev) => prev?.filter((n) => n.id !== id) ?? null)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-zinc-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Notificaciones</h3>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                <Check className="w-3 h-3" /> Marcar todas
              </button>
            )}
          </div>

          {loading && (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">Cargando…</div>
          )}

          {!loading && items && items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-500">No hay notificaciones.</div>
          )}

          {!loading && items && items.length > 0 && (
            <ul className="max-h-96 overflow-y-auto divide-y divide-zinc-100">
              {items.map((n) => (
                <li key={n.id} className={`px-4 py-3 hover:bg-zinc-50 ${!n.read_at ? 'bg-blue-50/30' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">{levelIcon[n.level]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="text-xs text-zinc-600 mt-0.5">{n.body}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-zinc-400">
                          {new Date(n.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                        {n.href && (
                          <Link href={n.href} className="text-[11px] text-blue-600 hover:underline">
                            Ver
                          </Link>
                        )}
                        {!n.read_at && (
                          <button onClick={() => markRead(n.id)} className="text-[11px] text-zinc-500 hover:text-zinc-900">
                            Marcar leída
                          </button>
                        )}
                      </div>
                    </div>
                    <button onClick={() => archive(n.id)} className="text-zinc-300 hover:text-zinc-600" title="Archivar">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
