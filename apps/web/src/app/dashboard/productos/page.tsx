/**
 * CUENTAX — Maestro: Productos
 * Mia: "El catálogo de productos acelera la emisión DTE.
 * Precio con/sin IVA visible, badge de exento claro, búsqueda instantánea."
 */
'use client'

import { useState } from 'react'
import { Search, Plus, Package, Edit, Trash2, Tag } from 'lucide-react'

interface Product {
  id: number
  codigo?: string
  nombre: string
  descripcion?: string
  precio: number
  precio_con_iva: number
  unidad: string
  exento: boolean
  categoria?: string
}

const MOCK_PRODUCTS: Product[] = [
  { id: 1, codigo: 'SW-001', nombre: 'Desarrollo web mensual',        precio: 500000,  precio_con_iva: 595000,  unidad: 'MES', exento: false, categoria: 'Software' },
  { id: 2, codigo: 'SUP-01', nombre: 'Soporte técnico hora',          precio: 85000,   precio_con_iva: 101150,  unidad: 'HR',  exento: false, categoria: 'Servicios' },
  { id: 3, codigo: 'LIC-01', nombre: 'Licencia CUENTAX anual',        precio: 1200000, precio_con_iva: 1428000, unidad: 'AÑO', exento: false, categoria: 'Licencias' },
  { id: 4, codigo: 'CONS-1', nombre: 'Consultoría contable hora',     precio: 75000,   precio_con_iva: 89250,   unidad: 'HR',  exento: false, categoria: 'Consultoría' },
  { id: 5, codigo: 'EXE-01', nombre: 'Curso capacitación (exento)',   precio: 250000,  precio_con_iva: 250000,  unidad: 'UN',  exento: true,  categoria: 'Educación' },
]

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const CATEGORIAS = Array.from(new Set(MOCK_PRODUCTS.map(p => p.categoria).filter(Boolean))) as string[]

export default function ProductosPage() {
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState<string>('todas')

  const filtered = MOCK_PRODUCTS.filter(p => {
    const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || (p.codigo ?? '').toLowerCase().includes(search.toLowerCase())
    const matchCat = cat === 'todas' || p.categoria === cat
    return matchSearch && matchCat
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--cx-text-primary)]">Productos y Servicios</h1>
          <p className="text-sm text-[var(--cx-text-secondary)] mt-0.5">{filtered.length} productos · Catálogo de la empresa</p>
        </div>
        <button className="btn-primary"><Plus size={14} /> Nuevo Producto</button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o código..." className="input-field pl-8 py-2 text-sm" />
        </div>
        {['todas', ...CATEGORIAS].map(c => (
          <button key={c} onClick={() => setCat(c!)} className={`px-3 py-2 rounded-xl text-sm font-medium capitalize transition-all border ${cat === c ? 'bg-[var(--cx-active-bg)] text-[var(--cx-active-icon)] border-[var(--cx-active-border)]' : 'text-[var(--cx-text-secondary)] border-[var(--cx-border-light)] hover:text-[var(--cx-text-primary)]'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-[var(--cx-border-light)] text-[10px] font-semibold text-[var(--cx-text-muted)] uppercase tracking-widest">
          <div className="col-span-1">Código</div>
          <div className="col-span-4">Nombre</div>
          <div className="col-span-2">Categoría</div>
          <div className="col-span-1">Unidad</div>
          <div className="col-span-2 text-right">Precio Neto</div>
          <div className="col-span-2 text-right">Precio c/IVA</div>
        </div>

        <div className="divide-y divide-[var(--cx-border-light)]">
          {filtered.map(p => (
            <div key={p.id} className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center hover:bg-[var(--cx-hover-bg)] transition-colors group">
              <div className="col-span-1 text-xs font-mono text-[var(--cx-text-secondary)]">{p.codigo ?? '—'}</div>
              <div className="col-span-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--cx-text-primary)] font-medium">{p.nombre}</span>
                  {p.exento && <span className="badge-dte bg-amber-500/10 text-amber-400 border border-amber-500/20">Exento</span>}
                </div>
              </div>
              <div className="col-span-2">
                <span className="flex items-center gap-1 text-xs text-[var(--cx-text-secondary)]">
                  <Tag size={10} />{p.categoria}
                </span>
              </div>
              <div className="col-span-1 text-xs text-[var(--cx-text-secondary)]">{p.unidad}</div>
              <div className="col-span-2 text-right text-sm text-[var(--cx-text-primary)]">{formatCLP(p.precio)}</div>
              <div className="col-span-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-bold text-[var(--cx-text-primary)]">{formatCLP(p.precio_con_iva)}</span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button className="p-1 rounded text-[var(--cx-text-muted)] hover:text-violet-400"><Edit size={11} /></button>
                    <button className="p-1 rounded text-[var(--cx-text-muted)] hover:text-red-400"><Trash2 size={11} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
