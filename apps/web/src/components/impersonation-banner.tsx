/**
 * Banner rojo persistente cuando un super-admin está actuando como
 * el tenant. Lee `impersonating_admin_id` del JWT en memoria; sin
 * dependencias adicionales (decodifica el payload manualmente).
 */
'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'

interface ImpersonationClaims {
  impersonating_admin_id?: number
  tenant_slug?: string
  email?: string
}

function decodeJwt(token: string): ImpersonationClaims | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    // base64url → base64
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json) as ImpersonationClaims
  } catch {
    return null
  }
}

export function ImpersonationBanner() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const [dismissed, setDismissed] = useState(false)
  const [claims, setClaims] = useState<ImpersonationClaims | null>(null)

  useEffect(() => {
    setClaims(accessToken ? decodeJwt(accessToken) : null)
    setDismissed(false)
  }, [accessToken])

  if (!claims?.impersonating_admin_id || dismissed) return null

  const handleExit = () => {
    // Force logout and re-login from admin
    useAuthStore.getState().clearAuth()
    window.location.href = '/login?reason=impersonation_exit'
  }

  return (
    <div className="sticky top-0 z-50 w-full bg-red-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
        <ShieldAlert className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1">
          <strong>Modo soporte activo</strong>
          <span className="opacity-90 ml-2">
            Estás viendo este tenant como super-admin #{claims.impersonating_admin_id}.
            Toda acción queda registrada en el audit log.
          </span>
        </div>
        <button
          onClick={handleExit}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-medium"
        >
          Salir del modo soporte
        </button>
        <button onClick={() => setDismissed(true)} className="opacity-70 hover:opacity-100" title="Ocultar">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
