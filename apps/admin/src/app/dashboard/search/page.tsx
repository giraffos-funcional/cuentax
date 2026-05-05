import Link from 'next/link'
import { adminFetch } from '@/lib/api'

interface SearchResult {
  tenants: Array<{ id: number; slug: string; name: string; status: string; primary_rut: string | null }>
  companies: Array<{ id: number; tenant_id: number; razon_social: string; rut: string | null }>
  admins: Array<{ id: number; email: string; role: string; active: boolean }>
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const q = (searchParams.q ?? '').trim()
  const result: SearchResult | null = q.length >= 2
    ? await adminFetch<SearchResult>('/search', { query: { q } })
    : null

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold">Búsqueda global</h2>
        <p className="text-sm text-muted-foreground">Tenants, companies, admins. Mínimo 2 caracteres.</p>
      </header>

      <form className="mb-6">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="RUT, slug, nombre, email…"
          className="w-full rounded-md border border-border px-4 py-3 text-base bg-white"
        />
      </form>

      {!result && (
        <p className="text-sm text-muted-foreground">Escribí al menos 2 caracteres para buscar.</p>
      )}

      {result && (
        <div className="space-y-6">
          <Section title={`Tenants (${result.tenants.length})`}>
            {result.tenants.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-border bg-white border border-border rounded-lg">
                {result.tenants.map((t) => (
                  <li key={t.id} className="px-4 py-3 hover:bg-muted/50">
                    <Link href={`/dashboard/tenants/${t.slug}`} className="block">
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {t.slug} · {t.status} · {t.primary_rut ?? '—'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Companies (${result.companies.length})`}>
            {result.companies.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-border bg-white border border-border rounded-lg">
                {result.companies.map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <p className="font-medium">{c.razon_social}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      tenant_id={c.tenant_id} · {c.rut ?? '—'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Super-admins (${result.admins.length})`}>
            {result.admins.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-border bg-white border border-border rounded-lg">
                {result.admins.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <p className="font-medium">{a.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.role} · {a.active ? 'activo' : 'inactivo'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm uppercase text-muted-foreground tracking-wide mb-2">{title}</h3>
      {children}
    </section>
  )
}

function Empty() {
  return <p className="text-sm text-muted-foreground italic">Sin resultados.</p>
}
