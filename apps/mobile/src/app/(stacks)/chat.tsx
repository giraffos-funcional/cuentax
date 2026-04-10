/**
 * CUENTAX Mobile — AI Chat Screen
 * Full-screen chat with SSE streaming, suggestion chips, and tool call cards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore, type ChatMessage } from '@/stores/chat.store';
import { useAIChat } from '@/hooks/use-ai-chat';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { SuggestionChips } from '@/components/chat/SuggestionChips';
import { LoadingDots } from '@/components/chat/StreamingText';
import { colors, radius, spacing, typography, shadows } from '@/theme';

export default function ChatScreen() {
  const { messages, isStreaming } = useChatStore();
  const { sendMessage, clearChat } = useAIChat();
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);

  const isEmpty = messages.length === 0;
  const lastMessage = messages[messages.length - 1];
  const showLoading =
    isStreaming && lastMessage?.role === 'assistant' && lastMessage.content === '';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      // Small delay to allow FlatList to update
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, lastMessage?.content]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    sendMessage(trimmed);
  }, [input, isStreaming, sendMessage]);

  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <MessageBubble message={item} />,
    [],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="sparkles" size={16} color={colors.text.inverse} />
            </View>
            <Text style={styles.headerTitle}>Asistente CuentaX</Text>
          </View>
          <View style={styles.headerActions}>
            {messages.length > 0 && (
              <TouchableOpacity
                onPress={clearChat}
                style={styles.headerButton}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={colors.text.muted}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleClose}
              style={styles.headerButton}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color={colors.text.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages or Suggestions */}
        {isEmpty ? (
          <SuggestionChips onSelect={handleSuggestion} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={showLoading ? <LoadingDots /> : null}
          />
        )}

        {/* Input area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Escribe tu pregunta..."
              placeholderTextColor={colors.text.muted}
              editable={!isStreaming}
              multiline
              maxLength={2000}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!input.trim() || isStreaming}
              style={[
                styles.sendButton,
                (!input.trim() || isStreaming) && styles.sendButtonDisabled,
              ]}
              activeOpacity={0.7}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={colors.text.inverse}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.disclaimer}>
            El asistente puede cometer errores. Verifica la información.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.surface,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    backgroundColor: colors.bg.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.brand.violet600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Messages
  messageList: {
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.sm,
  },

  // Input
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.bg.surface,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.size.base,
    color: colors.text.primary,
    lineHeight: typography.size.base * typography.lineHeight.normal,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.brand.violet600,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.violet,
  },
  sendButtonDisabled: {
    opacity: 0.4,
    ...shadows.sm,
  },
  disclaimer: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
});
