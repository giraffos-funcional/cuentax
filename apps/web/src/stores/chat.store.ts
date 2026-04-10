/**
 * CUENTAX — Chat Store (Zustand)
 * Estado del chat AI. Solo en memoria (NO persist — sesión only).
 */

import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatState {
  messages: ChatMessage[]
  isOpen: boolean
  isStreaming: boolean
  hasUnread: boolean

  // Actions
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  appendToLastMessage: (text: string) => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setStreaming: (streaming: boolean) => void
  clearHistory: () => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messages: [],
  isOpen: false,
  isStreaming: false,
  hasUnread: false,

  addMessage: (msg) => {
    const message: ChatMessage = {
      ...msg,
      id: crypto.randomUUID(),
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
