/**
 * CUENTAX — Maestro: Contactos (Clientes + Proveedores)
 * Mia: "El maestro de datos es el CRM interno del contador.
 * Busca por RUT o nombre, agrega desde el perfil del cliente,
 * y rellena el formulario DTE automáticamente."
 */
'use client'

import { useState } from 'react'
import { Search, Plus, Check, Building2, User,
         ArrowRight, Edit, Trash2, Phone, Mail } from 'lucide-react'

interface Contact {
  id: number
  rut: string
  razon_social: string
  giro: string
  email?: string
  telefono?: string
  direccion?: string
  es_cliente: boolean
  es_proveedor: boolean
  dtesCount: number
}

const MOCK_CONTACTS: Contact[] = [
  { id: 1, rut: '12.345.678-9', razon_social: 'Empresa ABC Ltda.',    giro: 'Retail',           email: 'contacto@abc.cl',       telefono: '+56 9 1234 5678', es_cliente: true,  es_proveedor: false, dtesCount: 12 },
  { id: 2, rut: '76.543.210-K', razon_social: 'Tech Solutions SpA',   giro: 'Software',         email: 'info@techsol.cl',       telefono: '+56 2 2345 6789', es_cliente: true,  es_proveedor: false, dtesCount: 7  },
  { id: 3, rut: '99.887.766-5', razon_social: 'Import & Co.',          giro: 'Importadora',     email: 'ventas@importco.cl',    telefono: '+56 9 8765 4321', es_cliente: true,  es_proveedor: true,  dtesCount: 3  },
  { id: 4, rut: '88.776.655-4', razon_social: 'Supplier Group Ltda.', giro: 'Distribuidora',   email: 'supplier@grupo.cl',     telefono: '',                es_cliente: false, es_proveedor: true,  dtesCount: 0  },
  { id: 5, rut: '55.443.322-1', razon_social: 'Startup XYZ',          giro: 'Tecnología',      email: 'hola@startupxyz.cl',   telefono: '+56 9 5544 3322', es_cliente: true,  es_proveedor: false, dtesCount: 5  },
]

export default function ContactosPage() {
  const [search, setSearch] = useState('')
  const [tipo, setTipo] = useState<'todos' | 'clientes' | 'proveedores'>('todos')

  const filtered = MOCK_CONTACTS.filter(c => {
    const matchSearch = !search ||
      c.razon_social.toLowerCase().includes(search.toLowerCase()) ||
      c.rut.includes(search)
    const matchTipo = tipo === 'todos' ||
      (tipo === 'clientes' && c.es_cliente) ||
      (tipo === 'proveedores' && c.es_proveedor)
    return matchSearch && matchTipo
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Contactos</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">{filtered.length} contactos · Clientes y proveedores</p>
        </div>
        <button className="btn-primary"><Plus size={14} /> Nuevo Contacto</button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o RUT..." className="input-field pl-8 py-2 text-sm" />
        </div>
        {(['todos', 'clientes', 'proveedores'] as const).map(t => (
          <button key={t} onClick={() => setTipo(t)} className={`px-3 py-2 rounded-xl text-sm font-medium capitalize transition-all border ${tipo === t ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-icon)] border-[var(--cx-active-border)]' : 'text-[var(--cx-text-secondary)] border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)]'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Grid de contactos */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(c => (
          <div key={c.id} className="card p-4 group hover:border-[var(--cx-border-hover)] transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center border border-[var(--cx-border-light)]">
                  <Building2 size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--cx-text-primary)]">{c.razon_social}</p>
                  <p className="text-xs text-[var(--cx-text-muted)] font-mono">{c.rut}</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded-lg text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)]"><Edit size={12} /></button>
                <button className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/5"><Trash2 size={12} /></button>
              </div>
            </div>

            <p className="text-xs text-[var(--cx-text-secondary)] mb-3">{c.giro}</p>

            <div className="space-y-1.5">
              {c.email && (
                <div className="flex items-center gap-2 text-xs text-[var(--cx-text-secondary)]">
                  <Mail size={11} className="text-[var(--cx-text-muted)]" />{c.email}
                </div>
              )}
              {c.telefono && (
                <div className="flex items-center gap-2 text-xs text-[var(--cx-text-secondary)]">
                  <Phone size={11} className="text-[var(--cx-text-muted)]" />{c.telefono}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--cx-border-light)]">
              <div className="flex gap-2">
                {c.es_cliente && <span className="badge-dte bg-[var(--cx-active-bg)] text-[var(--cx-active-icon)] border border-[var(--cx-active-border)]">Cliente</span>}
                {c.es_proveedor && <span className="badge-dte bg-blue-500/10 text-blue-400 border border-blue-500/20">Proveedor</span>}
              </div>
              <div className="flex items-center gap-1 text-xs text-[var(--cx-text-muted)]">
                <span>{c.dtesCount} DTEs</span>
                <ArrowRight size={10} />
              </div>
            </div>

            {/* Quick action */}
            <button
              onClick={() => window.location.href = `/dashboard/emitir?rut=${c.rut}&receptor=${encodeURIComponent(c.razon_social)}`}
              className="mt-2 w-full btn-secondary py-1.5 text-xs justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Emitir DTE →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
