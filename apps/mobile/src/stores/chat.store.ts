/**
 * CUENTAX Mobile — Chat Store (Zustand)
 * State for AI assistant chat. NOT persisted.
 */

import { create } from 'zustand';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
}

interface ToolCallInfo {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
}

interface ChatState {
  messages: ChatMessage[];
  isOpen: boolean;
  isStreaming: boolean;

  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  appendToLastMessage: (text: string) => void;
  addToolCall: (toolCall: ToolCallInfo) => void;
  updateToolCallStatus: (toolId: string, status: ToolCallInfo['status']) => void;
  setStreaming: (streaming: boolean) => void;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  isOpen: false,
  isStreaming: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
        },
      ],
    })),

  appendToLastMessage: (text) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = { ...last, content: last.content + text };
      }
      return { messages };
    }),

  addToolCall: (toolCall) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        const existing = last.toolCalls ?? [];
        messages[messages.length - 1] = {
          ...last,
          toolCalls: [...existing, toolCall],
        };
      }
      return { messages };
    }),

  updateToolCallStatus: (toolId, status) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant' && last.toolCalls) {
        messages[messages.length - 1] = {
          ...last,
          toolCalls: last.toolCalls.map((tc) =>
            tc.id === toolId ? { ...tc, status } : tc,
          ),
        };
      }
      return { messages };
    }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),
  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  clearMessages: () => set({ messages: [] }),
}));

export type { ChatMessage, ChatState, ToolCallInfo };
