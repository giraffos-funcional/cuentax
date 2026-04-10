/**
 * CUENTAX — ChatMessage
 * Burbuja de mensaje individual con markdown básico.
 */

'use client'

import { memo } from 'react'
import type { ChatMessage as ChatMessageType } from '@/stores/chat.store'

// Simple markdown: **bold**, bullet lists, line breaks
function renderSimpleMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  lines.forEach((line, i) => {
    // Bold
    let processed: React.ReactNode[] = []
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    parts.forEach((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        processed.push(<strong key={j}>{part.slice(2, -2)}</strong>)
      } else {
        processed.push(part)
      }
    })

    // Bullet list
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <li key={i} className="ml-4 list-disc">
          {processed.map((p) =>
            typeof p === 'string' ? p.replace(/^[-*]\s/, '') : p,
          )}
        </li>,
      )
    } else if (line === '') {
      elements.push(<br key={i} />)
    } else {
      elements.push(<p key={i} className="mb-1 last:mb-0">{processed}</p>)
    }
  })

  return elements
}

function formatTime(date: Date) {
  return new Date(date).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ChatMessageProps {
  message: ChatMessageType
}

export const ChatMessageBubble = memo<ChatMessageProps>(({ message }) => {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-md'
            : 'bg-[var(--cx-bg-elevated)] text-[var(--cx-text-primary)] rounded-bl-md border border-[var(--cx-border)]'
        }`}
      >
        <div className="break-words">{renderSimpleMarkdown(message.content)}</div>
        <p
          className={`text-[10px] mt-1.5 ${
            isUser ? 'text-white/60' : 'text-[var(--cx-text-muted)]'
          }`}
        >
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  )
})

ChatMessageBubble.displayName = 'ChatMessageBubble'
