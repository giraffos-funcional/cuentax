/**
 * CUENTAX — Help Center: Client-side fuzzy search
 * Tokenize query, match against title/summary/keywords, score and sort.
 */

import type { HelpArticle } from './help-articles'

// Normalize text for comparison: lowercase, remove accents
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Tokenize a string into individual words
function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter(t => t.length > 1)
}

// Check if a token matches a target (partial match)
function tokenMatches(token: string, target: string): boolean {
  return target.includes(token)
}

interface ScoredArticle {
  article: HelpArticle
  score: number
}

export function searchArticles(query: string, articles: HelpArticle[]): HelpArticle[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const queryTokens = tokenize(trimmed)
  if (queryTokens.length === 0) return []

  const scored: ScoredArticle[] = []

  for (const article of articles) {
    let score = 0

    const titleNorm = normalize(article.title)
    const summaryNorm = normalize(article.summary)
    const keywordsNorm = article.keywords.map(normalize)
    const categoryNorm = normalize(article.categoryLabel)

    for (const token of queryTokens) {
      // Title match (highest weight)
      if (tokenMatches(token, titleNorm)) {
        score += 10
        // Bonus for exact word match in title
        if (titleNorm.split(/\s+/).some(w => w === token)) {
          score += 5
        }
      }

      // Keyword match (high weight)
      for (const kw of keywordsNorm) {
        if (tokenMatches(token, kw)) {
          score += 8
          // Bonus for exact keyword match
          if (kw === token || kw.split(/\s+/).some(w => w === token)) {
            score += 4
          }
        }
      }

      // Category match (medium weight)
      if (tokenMatches(token, categoryNorm)) {
        score += 4
      }

      // Summary match (lower weight)
      if (tokenMatches(token, summaryNorm)) {
        score += 3
      }

      // Section content match (lowest weight)
      for (const section of article.sections) {
        const sectionTitle = normalize(section.title)
        const sectionContent = normalize(section.content.replace(/<[^>]*>/g, ''))
        if (tokenMatches(token, sectionTitle)) {
          score += 2
        }
        if (tokenMatches(token, sectionContent)) {
          score += 1
        }
      }
    }

    // Bonus for matching all query tokens (relevance)
    const allTokensMatch = queryTokens.every(token =>
      tokenMatches(token, titleNorm) ||
      keywordsNorm.some(kw => tokenMatches(token, kw)) ||
      tokenMatches(token, summaryNorm)
    )
    if (allTokensMatch) {
      score += queryTokens.length * 3
    }

    if (score > 0) {
      scored.push({ article, score })
    }
  }

  // Sort by score descending, return top 10
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 10).map(s => s.article)
}
