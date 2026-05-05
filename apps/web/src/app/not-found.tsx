import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-zinc-50">
      <div className="max-w-md text-center">
        <p className="text-6xl mb-2">404</p>
        <h1 className="text-2xl font-semibold mb-2">Página no encontrada</h1>
        <p className="text-sm text-zinc-500 mb-6">
          La página que buscás no existe o fue movida.
        </p>
        <Link href="/dashboard" className="inline-block rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
          Volver al dashboard
        </Link>
      </div>
    </main>
  )
}
