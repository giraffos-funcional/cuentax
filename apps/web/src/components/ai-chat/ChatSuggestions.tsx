/**
 * CUENTAX — ChatSuggestions
 * Sugerencias de preguntas frecuentes para el asistente AI.
 */

'use client'

import { memo } from 'react'
import { Sparkles } from 'lucide-react'

const SUGGESTIONS = [
  '¿Cuánto he facturado este mes?',
  '¿Cuáles son mis 5 clientes más grandes?',
  '¿Cuánto IVA debo pagar este período?',
  '¿Tengo facturas rechazadas?',
  '¿Cuántos folios me quedan?',
  '¿Cómo emito una nota de crédito?',
] as const

interface ChatSuggestionsProps {
  onSelect: (question: string) => void
}

export const ChatSuggestions = memo<ChatSuggestionsProps>(({ onSelect }) => {
  return (
    <div className="flex flex-col items-center px-4 py-8">
      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-center mb-4">
        <Sparkles className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--cx-text-primary)] mb-1">
        Asistente CuentaX
      </h3>
      <p className="text-xs text-[var(--cx-text-muted)] mb-6 text-center">
        Pregúntame sobre tu empresa, facturación, impuestos y más.
      </p>
      <div className="grid grid-cols-2 gap-2 w-full">
        {SUGGESTIONS.map((question) => (
          <button
            key={question}
            onClick={() => onSelect(question)}
            className="text-left text-xs px-3 py-2.5 rounded-xl
                       bg-[var(--cx-bg-surface)] border border-[var(--cx-border)]
                       text-[var(--cx-text-secondary)]
                       hover:border-[var(--cx-active-border)] hover:bg-[var(--cx-active-bg)]
                       hover:text-[var(--cx-active-text)]
                       transition-all duration-150 cursor-pointer"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
})

ChatSuggestions.displayName = 'ChatSuggestions'
