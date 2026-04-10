/**
 * CUENTAX — ChatPanel
 * Panel principal del chat AI con historial, input y sugerencias.
 */

'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { X, Sparkles, ArrowUp } from 'lucide-react'
import { useChatStore } from '@/stores/chat.store'
import { useAIChat } from '@/hooks'
import { ChatMessageBubble } from './ChatMessage'
import { ChatSuggestions } from './ChatSuggestions'

// Animated loading dots
function LoadingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="w-2 h-2 rounded-full bg-[var(--cx-violet-400)] animate-bounce [animation-delay:0ms]" />
      <div className="w-2 h-2 rounded-full bg-[var(--cx-violet-400)] animate-bounce [animation-delay:150ms]" />
      <div className="w-2 h-2 rounded-full bg-[var(--cx-violet-400)] animate-bounce [animation-delay:300ms]" />
    </div>
  )
}

export function ChatPanel() {
  const { messages, isStreaming, setOpen } = useChatStore()
  const { sendMessage } = useAIChat()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    setInput('')
    sendMessage(trimmed)
  }, [input, isStreaming, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleSuggestion = useCallback(
    (question: string) => {
      sendMessage(question)
    },
    [sendMessage],
  )

  const isEmpty = messages.length === 0
  const showLoading = isStreaming && messages.length > 0 && messages[messages.length - 1]?.content === ''

  return (
    <div className="flex flex-col h-full bg-[var(--cx-bg-surface)] rounded-2xl md:rounded-2xl overflow-hidden border border-[var(--cx-border)] shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cx-border)] bg-[var(--cx-bg-surface)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-[var(--cx-text-primary)]">
            Asistente CuentaX
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="w-8 h-8 flex items-center justify-center rounded-lg
                     text-[var(--cx-text-muted)] hover:text-[var(--cx-text-primary)]
                     hover:bg-[var(--cx-hover-bg)] transition-colors cursor-pointer"
          aria-label="Cerrar chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <ChatSuggestions onSelect={handleSuggestion} />
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {showLoading && <LoadingDots />}
          </>
        )}
      </div>

      {/* Input area */}
      <div className="px-4 pb-3 pt-2 border-t border-[var(--cx-border)]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta..."
            disabled={isStreaming}
            className="flex-1 px-3.5 py-2.5 rounded-xl text-sm
                       bg-[var(--cx-bg-elevated)] border border-[var(--cx-border)]
                       text-[var(--cx-text-primary)] placeholder-[var(--cx-text-muted)]
                       focus:outline-none focus:border-[var(--cx-violet-500)] focus:ring-2 focus:ring-[var(--cx-violet-500)]/20
                       transition-all duration-150
                       disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Mensaje para el asistente"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-10 h-10 flex items-center justify-center rounded-xl
                       bg-gradient-to-r from-violet-600 to-indigo-600 text-white
                       hover:from-violet-500 hover:to-indigo-500
                       transition-all duration-150 active:scale-95
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
                       cursor-pointer shrink-0"
            aria-label="Enviar mensaje"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-[var(--cx-text-muted)] text-center mt-2">
          Orientación general, no asesoría tributaria profesional
        </p>
      </div>
    </div>
  )
}
