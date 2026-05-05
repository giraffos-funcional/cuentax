'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-zinc-50">
      <div className="max-w-md text-center">
        <p className="text-6xl mb-2">⚠️</p>
        <h1 className="text-2xl font-semibold mb-2">Algo salió mal</h1>
        <p className="text-sm text-zinc-600 mb-1">
          Tu sesión sigue activa. Refrescá la página o reintentá.
        </p>
        {error.digest && <p className="text-xs text-zinc-400 font-mono mb-6">id: {error.digest}</p>}
        <button onClick={reset} className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
          Reintentar
        </button>
      </div>
    </main>
  )
}
