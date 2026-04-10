/**
 * CUENTAX — AIChatWidget
 * Botón flotante + panel de chat AI con animaciones.
 */

'use client'

import { MessageCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useChatStore } from '@/stores/chat.store'
import { ChatPanel } from './ChatPanel'

export function AIChatWidget() {
  const { isOpen, hasUnread, toggleOpen } = useChatStore()

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          onClick={toggleOpen}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full
                     flex items-center justify-center
                     shadow-lg transition-all duration-200
                     active:scale-95 cursor-pointer hover:shadow-xl"
          style={{
            background: 'linear-gradient(135deg, var(--cx-violet-600), var(--cx-indigo-600))',
            boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)',
          }}
          aria-label="Abrir asistente AI"
        >
          <MessageCircle className="w-6 h-6 text-white" />
          {/* Unread indicator */}
          {hasUnread && (
            <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />
          )}
        </button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed z-50
                       inset-0 md:inset-auto
                       md:bottom-6 md:right-6
                       md:w-[400px] md:h-[600px]"
          >
            <ChatPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
