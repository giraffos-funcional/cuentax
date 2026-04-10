/**
 * CUENTAX — Help Button for Topbar
 * Small "?" circle that navigates to the help center.
 */
'use client'

import { useRouter } from 'next/navigation'
import { HelpCircle } from 'lucide-react'

export function HelpButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push('/dashboard/ayuda')}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--cx-text-muted)] hover:text-[var(--cx-active-icon)] hover:bg-[var(--cx-active-bg)] transition-colors"
      title="Centro de Ayuda"
      aria-label="Abrir Centro de Ayuda"
    >
      <HelpCircle size={15} />
    </button>
  )
}
