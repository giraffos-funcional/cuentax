'use client'

import { useState, useEffect, useCallback } from 'react'
import { Download, X } from 'lucide-react'

const DISMISS_KEY = 'cuentax-pwa-install-dismissed'
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * PWA install banner — shown on mobile when the app is installable.
 * Dismissible with a 7-day cooldown stored in localStorage.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Check if already dismissed recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DURATION_MS) {
      return
    }

    // Check if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
    setDeferredPrompt(null)
  }, [])

  if (!visible) return null

  return (
    <div
      className="pwa-install-banner fixed bottom-0 left-0 right-0 z-50 p-4 md:hidden safe-area-bottom"
      role="banner"
      aria-label="Instalar aplicacion"
    >
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--cx-bg-surface)] border border-[var(--cx-border-light)] shadow-lg">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/20 shrink-0">
          <span className="text-white font-bold text-sm tracking-tighter">CX</span>
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--cx-text-primary)]">
            Instalar CuentaX
          </p>
          <p className="text-xs text-[var(--cx-text-muted)] truncate">
            Escanea boletas y factura desde tu celular
          </p>
        </div>

        {/* Actions */}
        <button
          onClick={handleInstall}
          className="btn-primary text-xs px-3 py-2 shrink-0"
          aria-label="Instalar aplicacion"
        >
          <Download size={14} />
          Instalar
        </button>

        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-secondary)] hover:bg-[var(--cx-hover-bg)] transition-colors shrink-0"
          aria-label="Cerrar banner de instalacion"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
