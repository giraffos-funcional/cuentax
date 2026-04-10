/**
 * CUENTAX Mobile — AI Chat Hook (SSE via XMLHttpRequest)
 * React Native fetch does not support ReadableStream reliably,
 * so we use XMLHttpRequest with onprogress for SSE parsing.
 */

import { useCallback, useRef } from 'react';
import Constants from 'expo-constants';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore, type ToolCallInfo } from '@/stores/chat.store';

const API_URL =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'https://cuentaxapi.giraffos.com';

/** Human-readable labels for known tool names */
const TOOL_LABELS: Record<string, string> = {
  get_ventas_periodo: 'Consultando ventas...',
  get_compras_periodo: 'Consultando compras...',
  get_balance_iva: 'Calculando balance IVA...',
  get_clientes_top: 'Buscando mejores clientes...',
  get_folios_disponibles: 'Verificando folios...',
  get_gastos_periodo: 'Consultando gastos...',
  get_dashboard_stats: 'Obteniendo estadísticas...',
  get_flujo_caja: 'Consultando flujo de caja...',
};

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Ejecutando ${toolName}...`;
}

export function useAIChat() {
  const { accessToken } = useAuthStore();
  const {
    addMessage,
    appendToLastMessage,
    addToolCall,
    updateToolCallStatus,
    setStreaming,
  } = useChatStore();
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const processedLengthRef = useRef(0);

  const sendMessage = useCallback(
    (content: string) => {
      // Add user message
      addMessage({ role: 'user', content });
      // Add empty assistant placeholder
      addMessage({ role: 'assistant', content: '' });
      setStreaming(true);

      // Build messages payload from store (exclude the empty placeholder)
      const allMessages = useChatStore.getState().messages;
      const payload = allMessages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      processedLengthRef.current = 0;

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.open('POST', `${API_URL}/api/v1/ai/chat`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      }

      xhr.onprogress = () => {
        const fullText = xhr.responseText;
        const newText = fullText.slice(processedLengthRef.current);
        processedLengthRef.current = fullText.length;

        // Parse SSE data lines from the new chunk
        const lines = newText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const raw = trimmed.slice(6);
          if (raw === '[DONE]') continue;

          try {
            const data = JSON.parse(raw);

            if (data.type === 'text_delta' && data.text) {
              appendToLastMessage(data.text);
            } else if (data.type === 'tool_use' && data.name) {
              const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              const toolCall: ToolCallInfo = {
                id: toolId,
                name: data.name,
                status: 'running',
              };
              addToolCall(toolCall);

              // Mark as done after a short delay (tool results come as text_delta)
              setTimeout(() => {
                updateToolCallStatus(toolId, 'done');
              }, 2000);
            } else if (data.type === 'error') {
              appendToLastMessage(
                '\n\n_Error al procesar tu consulta. Intenta de nuevo._',
              );
            } else if (data.type === 'done') {
              // Stream complete
            }
          } catch {
            // Skip malformed SSE chunks
          }
        }
      };

      xhr.onloadend = () => {
        setStreaming(false);
        xhrRef.current = null;
      };

      xhr.onerror = () => {
        appendToLastMessage(
          '\n\n_Error de conexión. Verifica tu internet e intenta de nuevo._',
        );
        setStreaming(false);
        xhrRef.current = null;
      };

      xhr.ontimeout = () => {
        appendToLastMessage(
          '\n\n_La consulta tardó demasiado. Intenta de nuevo._',
        );
        setStreaming(false);
        xhrRef.current = null;
      };

      xhr.timeout = 60_000;
      xhr.send(JSON.stringify({ messages: payload }));
    },
    [
      accessToken,
      addMessage,
      appendToLastMessage,
      addToolCall,
      updateToolCallStatus,
      setStreaming,
    ],
  );

  const cancelStream = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
      setStreaming(false);
    }
  }, [setStreaming]);

  const clearChat = useCallback(() => {
    cancelStream();
    useChatStore.getState().clearMessages();
  }, [cancelStream]);

  return { sendMessage, clearChat, cancelStream, getToolLabel };
}
