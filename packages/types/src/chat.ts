/**
 * @cuentax/types — Chat types
 * Extracted from apps/web/src/stores/chat.store.ts
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface ChatState {
  messages: ChatMessage[]
  isOpen: boolean
  isStreaming: boolean
  hasUnread: boolean
}

// ── Zod Schemas ───────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.coerce.date(),
})
