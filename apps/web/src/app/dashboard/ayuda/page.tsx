/**
 * CUENTAX — Centro de Ayuda
 * Main help page with search, category grid, and popular articles.
 */
'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Search, BookOpen, FileText, Camera, Hash, Users,
  BarChart3, PieChart, Calculator, Briefcase, Landmark,
  Settings, HelpCircle, Sparkles, ArrowRight, X,
} from 'lucide-react'
import { HELP_CATEGORIES, HELP_ARTICLES, getArticlesByCategory, getPopularArticles } from './content/help-articles'
import type { HelpArticle } from './content/help-articles'
import { searchArticles } from './content/help-search'

// ── Icon map ────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen, FileText, Camera, Hash, Users, BarChart3,
  PieChart, Calculator, Briefcase, Landmark, Settings,
  HelpCircle, Sparkles,
}

function getIcon(name: string) {
  return ICON_MAP[name] ?? HelpCircle
}

// ── Category Card ───────────────────────────────────────────────
function CategoryCard({
  category,
  articleCount,
  isActive,
  onClick,
}: {
  category: { key: string; label: string; icon: string; description: string }
  articleCount: number
  isActive: boolean
  onClick: () => void
}) {
  const Icon = getIcon(category.icon)
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left transition-all duration-200 hover:shadow-md hover:border-[var(--cx-border-hover)] group ${
        isActive
          ? 'border-[var(--cx-active-border)] bg-[var(--cx-active-bg)]'
          : ''
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
        isActive
          ? 'bg-gradient-to-br from-violet-500 to-indigo-600'
          : 'bg-[var(--cx-bg-elevated)] group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-indigo-600'
      }`}>
        <Icon
          size={18}
          className={`transition-colors ${
            isActive
              ? 'text-white'
              : 'text-[var(--cx-text-muted)] group-hover:text-white'
          }`}
        />
      </div>
      <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] mb-0.5">
        {category.label}
      </h3>
      <p className="text-xs text-[var(--cx-text-muted)] mb-2 line-clamp-2">
        {category.description}
      </p>
      <span className="text-[10px] font-medium text-[var(--cx-text-secondary)]">
        {articleCount} {articleCount === 1 ? 'articulo' : 'articulos'}
      </span>
    </button>
  )
}

// ── Article List Item ───────────────────────────────────────────
function ArticleListItem({ article }: { article: HelpArticle }) {
  const Icon = getIcon(article.icon)
  return (
    <Link
      href={`/dashboard/ayuda/${article.slug}`}
      className="card p-4 flex items-start gap-3 hover:shadow-md hover:border-[var(--cx-border-hover)] transition-all duration-200 group"
    >
      <div className="w-9 h-9 rounded-lg bg-[var(--cx-bg-elevated)] flex items-center justify-center shrink-0 group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-indigo-600 transition-colors">
        <Icon size={15} className="text-[var(--cx-text-muted)] group-hover:text-white transition-colors" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-[var(--cx-text-primary)] mb-0.5 group-hover:text-[var(--cx-active-text)] transition-colors">
          {article.title}
        </h4>
        <p className="text-xs text-[var(--cx-text-muted)] line-clamp-2">
          {article.summary}
        </p>
        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-[var(--cx-active-icon)] opacity-0 group-hover:opacity-100 transition-opacity">
          Leer articulo <ArrowRight size={10} />
        </span>
      </div>
    </Link>
  )
}

// ── Page ────────────────────────────────────────────────────────
export default function AyudaPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const articlesRef = useRef<HTMLDivElement>(null)

  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    return searchArticles(search, HELP_ARTICLES)
  }, [search])

  const filteredArticles = useMemo(() => {
    if (!activeCategory) return []
    return getArticlesByCategory(activeCategory)
  }, [activeCategory])

  const popularArticles = useMemo(() => getPopularArticles(), [])

  const isSearching = search.trim().length > 0

  // Auto-scroll to articles when category is selected
  useEffect(() => {
    if (activeCategory && filteredArticles.length > 0 && articlesRef.current) {
      articlesRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeCategory, filteredArticles])

  const handleCategoryClick = (key: string) => {
    setSearch('')
    setActiveCategory(activeCategory === key ? null : key)
  }

  const clearSearch = () => {
    setSearch('')
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Hero */}
      <div className="text-center pt-4 pb-2">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <BookOpen size={24} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--cx-text-primary)] mb-1">
          Centro de Ayuda
        </h1>
        <p className="text-sm text-[var(--cx-text-secondary)] mb-6">
          Encuentra respuestas a tus dudas sobre CuentaX, facturacion electronica y contabilidad
        </p>

        {/* Search bar */}
        <div className="relative max-w-lg mx-auto">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--cx-text-muted)]" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setActiveCategory(null) }}
            placeholder="Buscar en el Centro de Ayuda..."
            className="input-field pl-11 pr-10 py-3 text-sm"
            aria-label="Buscar articulos de ayuda"
          />
          {search && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)] hover:bg-[var(--cx-hover-bg)] transition-colors"
              aria-label="Limpiar busqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search Results */}
      {isSearching && (
        <div>
          <p className="text-xs font-medium text-[var(--cx-text-secondary)] mb-3">
            {searchResults.length > 0
              ? `${searchResults.length} resultado${searchResults.length > 1 ? 's' : ''} para "${search}"`
              : `Sin resultados para "${search}"`
            }
          </p>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {searchResults.map(article => (
                <ArticleListItem key={article.slug} article={article} />
              ))}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <HelpCircle size={28} className="mx-auto text-[var(--cx-text-muted)] mb-3" />
              <p className="text-sm font-medium text-[var(--cx-text-primary)] mb-1">
                No encontramos resultados
              </p>
              <p className="text-xs text-[var(--cx-text-muted)]">
                Intenta con otras palabras clave o navega por las categorias
              </p>
            </div>
          )}
        </div>
      )}

      {/* Category Grid */}
      {!isSearching && (
        <>
          <div>
            <h2 className="section-title mb-3">Categorias</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {HELP_CATEGORIES.map(cat => (
                <CategoryCard
                  key={cat.key}
                  category={cat}
                  articleCount={getArticlesByCategory(cat.key).length}
                  isActive={activeCategory === cat.key}
                  onClick={() => handleCategoryClick(cat.key)}
                />
              ))}
            </div>
          </div>

          {/* Filtered articles for selected category */}
          {activeCategory && filteredArticles.length > 0 && (
            <div ref={articlesRef}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">
                  {HELP_CATEGORIES.find(c => c.key === activeCategory)?.label ?? 'Articulos'}
                </h2>
                <button
                  onClick={() => setActiveCategory(null)}
                  className="text-xs text-[var(--cx-active-icon)] hover:underline"
                >
                  Ver todas las categorias
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredArticles.map(article => (
                  <ArticleListItem key={article.slug} article={article} />
                ))}
              </div>
            </div>
          )}

          {/* Popular Articles */}
          {!activeCategory && (
            <div>
              <h2 className="section-title mb-3">Articulos populares</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {popularArticles.map(article => (
                  <ArticleListItem key={article.slug} article={article} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
