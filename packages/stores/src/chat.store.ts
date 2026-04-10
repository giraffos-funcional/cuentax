/**
 * @cuentax/stores — Chat Store factory
 * Session-only (no persistence). Works on web and mobile.
 */

import { createStore } from 'zustand/vanilla'
import type { ChatMessage } from '@cuentax/types'

// ── State + Actions ─────────────────────────────────────────

export interface ChatStoreState {
  messages: ChatMessage[]
  isOpen: boolean
  isStreaming: boolean
  hasUnread: boolean
}

export interface ChatStoreActions {
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  appendToLastMessage: (text: string) => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setStreaming: (streaming: boolean) => void
  clearHistory: () => void
}

export type ChatStore = ChatStoreState & ChatStoreActions

// ── ID generator (platform-agnostic) ────────────────────────

declare const crypto: { randomUUID?: () => string } | undefined

function generateId(): string {
  // crypto.randomUUID available in Node 19+, modern browsers, and RN Hermes
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: simple random id
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create the chat store. No persistence — session only.
 */
export function createChatStore() {
  return createStore<ChatStore>()((set, get) => ({
    messages: [],
    isOpen: false,
    isStreaming: false,
    hasUnread: false,

    addMessage: (msg) => {
      const message: ChatMessage = {
        ...msg,
        id: generateId(),
        timestamp: new Date(),
      }
      set((state) => ({
        messages: [...state.messages, message],
        hasUnread: !state.isOpen && msg.role === 'assistant',
      }))
    },

    appendToLastMessage: (text) => {
      set((state) => {
        const messages = [...state.messages]
        const last = messages[messages.length - 1]
        if (last && last.role === 'assistant') {
          messages[messages.length - 1] = { ...last, content: last.content + text }
        }
        return { messages }
      })
    },

    setOpen: (open) => set({ isOpen: open, hasUnread: open ? false : get().hasUnread }),

    toggleOpen: () => {
      const next = !get().isOpen
      set({ isOpen: next, hasUnread: next ? false : get().hasUnread })
    },

    setStreaming: (streaming) => set({ isStreaming: streaming }),

    clearHistory: () => set({ messages: [], hasUnread: false }),
  }))
}
