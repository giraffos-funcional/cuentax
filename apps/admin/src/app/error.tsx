'use client'

import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground mb-2">
          Ocurrió un error inesperado. Ya quedó registrado en logs.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono mb-6">id: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Reintentar
        </button>
      </div>
    </main>
  )
}
