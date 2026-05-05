import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <FileQuestion className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">No encontrado</h1>
        <p className="text-sm text-muted-foreground mb-6">
          La página que buscás no existe.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Volver al dashboard
        </Link>
      </div>
    </main>
  )
}
