import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      Cargando…
    </div>
  )
}
