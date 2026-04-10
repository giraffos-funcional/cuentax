/**
 * CUENTAX — Help Article Detail Page
 * Renders a single help article with sections, tips, warnings, and related articles.
 * NOTE: dangerouslySetInnerHTML is used with static, hardcoded content only (from help-articles.ts).
 * No user-generated content is rendered this way.
 */
'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  ChevronRight, ArrowLeft, Lightbulb, AlertTriangle, ArrowRight,
  BookOpen, FileText, Camera, Hash, Users, BarChart3,
  PieChart, Calculator, Briefcase, Landmark, Settings,
  HelpCircle, Sparkles,
} from 'lucide-react'
import { getArticleBySlug, getRelatedArticles, HELP_CATEGORIES } from '../content/help-articles'

// ── Icon map ────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen, FileText, Camera, Hash, Users, BarChart3,
  PieChart, Calculator, Briefcase, Landmark, Settings,
  HelpCircle, Sparkles,
}

function getIcon(name: string) {
  return ICON_MAP[name] ?? HelpCircle
}

// ── Not Found ───────────────────────────────────────────────────
function ArticleNotFound() {
  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="card p-12 text-center">
        <HelpCircle size={40} className="mx-auto text-[var(--cx-text-muted)] mb-4" />
        <h1 className="text-lg font-bold text-[var(--cx-text-primary)] mb-2">
          Articulo no encontrado
        </h1>
        <p className="text-sm text-[var(--cx-text-muted)] mb-6">
          El articulo que buscas no existe o fue movido.
        </p>
        <Link
          href="/dashboard/ayuda"
          className="btn-primary inline-flex"
        >
          <ArrowLeft size={14} /> Volver al Centro de Ayuda
        </Link>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────
export default function ArticlePage() {
  const params = useParams()
  const slug = params?.slug as string

  const article = useMemo(() => getArticleBySlug(slug), [slug])
  const relatedArticles = useMemo(
    () => (article ? getRelatedArticles(article) : []),
    [article]
  )

  if (!article) return <ArticleNotFound />

  const Icon = getIcon(article.icon)
  const category = HELP_CATEGORIES.find(c => c.key === article.category)

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-[var(--cx-text-muted)] mb-6" aria-label="Breadcrumb">
        <Link
          href="/dashboard/ayuda"
          className="hover:text-[var(--cx-text-primary)] transition-colors"
        >
          Centro de Ayuda
        </Link>
        <ChevronRight size={10} />
        <Link
          href={`/dashboard/ayuda?cat=${article.category}`}
          className="hover:text-[var(--cx-text-primary)] transition-colors"
        >
          {article.categoryLabel}
        </Link>
        <ChevronRight size={10} />
        <span className="text-[var(--cx-text-secondary)] font-medium truncate max-w-[200px]">
          {article.title}
        </span>
      </nav>

      {/* Article Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-500/20">
            <Icon size={18} className="text-white" />
          </div>
          <div>
            <span className="text-[10px] font-semibold text-[var(--cx-active-icon)] uppercase tracking-wider">
              {article.categoryLabel}
            </span>
          </div>
        </div>
        <h1 className="text-xl font-bold text-[var(--cx-text-primary)] mb-2">
          {article.title}
        </h1>
        <p className="text-sm text-[var(--cx-text-secondary)] leading-relaxed">
          {article.summary}
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {article.sections.map((section, idx) => (
          <div key={idx} className="card p-5">
            <h2 className="text-sm font-bold text-[var(--cx-text-primary)] mb-3">
              {section.title}
            </h2>
            {/* Static hardcoded content from help-articles.ts — safe to render as HTML */}
            <div
              className="text-sm text-[var(--cx-text-secondary)] leading-relaxed prose-help"
              dangerouslySetInnerHTML={{ __html: section.content }}
            />

            {/* Tip box */}
            {section.tip && (
              <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-[var(--cx-status-ok-bg)] border border-[var(--cx-status-ok-border)]">
                <Lightbulb size={14} className="text-[var(--cx-status-ok-text)] shrink-0 mt-0.5" />
                <p className="text-xs text-[var(--cx-status-ok-text)] leading-relaxed">
                  <strong>Tip:</strong> {section.tip}
                </p>
              </div>
            )}

            {/* Warning box */}
            {section.warning && (
              <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-[var(--cx-status-warn-bg)] border border-[var(--cx-status-warn-border)]">
                <AlertTriangle size={14} className="text-[var(--cx-status-warn-text)] shrink-0 mt-0.5" />
                <p className="text-xs text-[var(--cx-status-warn-text)] leading-relaxed">
                  <strong>Importante:</strong> {section.warning}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <div className="mt-10">
          <h2 className="section-title mb-3">Articulos relacionados</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedArticles.map(related => {
              const RelIcon = getIcon(related.icon)
              return (
                <Link
                  key={related.slug}
                  href={`/dashboard/ayuda/${related.slug}`}
                  className="card p-4 flex items-start gap-3 hover:shadow-md hover:border-[var(--cx-border-hover)] transition-all duration-200 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--cx-bg-elevated)] flex items-center justify-center shrink-0 group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-indigo-600 transition-colors">
                    <RelIcon size={14} className="text-[var(--cx-text-muted)] group-hover:text-white transition-colors" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold text-[var(--cx-text-primary)] group-hover:text-[var(--cx-active-text)] transition-colors">
                      {related.title}
                    </h4>
                    <p className="text-[11px] text-[var(--cx-text-muted)] line-clamp-1 mt-0.5">
                      {related.summary}
                    </p>
                  </div>
                  <ArrowRight size={12} className="text-[var(--cx-text-muted)] shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 pt-6 border-t border-[var(--cx-border-light)]">
        <Link
          href="/dashboard/ayuda"
          className="inline-flex items-center gap-2 text-sm text-[var(--cx-active-icon)] hover:underline font-medium"
        >
          <ArrowLeft size={14} /> Volver al Centro de Ayuda
        </Link>
      </div>
    </div>
  )
}
