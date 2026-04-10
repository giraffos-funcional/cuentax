/**
 * CUENTAX Mobile — MessageBubble
 * Chat message bubble with simple markdown and tool call cards.
 */

import { memo, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ChatMessage } from '@/stores/chat.store';
import { colors, radius, spacing, typography } from '@/theme';
import { ToolResultCard } from './ToolResultCard';

/** Simple markdown: **bold**, bullet lists (- or *), line breaks */
function renderSimpleMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      elements.push(<View key={i} style={{ height: 6 }} />);
      continue;
    }

    // Bullet list items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletContent = trimmed.slice(2);
      elements.push(
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{'\u2022'}</Text>
          <Text style={styles.bulletText}>{renderInlineMarkdown(bulletContent)}</Text>
        </View>,
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <Text key={i} style={styles.paragraph}>
        {renderInlineMarkdown(trimmed)}
      </Text>,
    );
  }

  return elements;
}

/** Inline markdown: **bold** */
function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={j} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part;
  });
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MessageBubbleProps {
  message: ChatMessage;
  isUserBubble?: boolean;
}

export const MessageBubble = memo<MessageBubbleProps>(({ message }) => {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        {/* Tool call cards */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <View style={styles.toolCalls}>
            {message.toolCalls.map((tc) => (
              <ToolResultCard key={tc.id} toolCall={tc} />
            ))}
          </View>
        )}

        {/* Message content */}
        {message.content.length > 0 && (
          <View>
            {isUser ? (
              <Text style={styles.userText}>{message.content}</Text>
            ) : (
              <View>{renderSimpleMarkdown(message.content)}</View>
            )}
          </View>
        )}

        {/* Timestamp */}
        <Text
          style={[
            styles.timestamp,
            isUser ? styles.timestampUser : styles.timestampAssistant,
          ]}
        >
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
});

MessageBubble.displayName = 'MessageBubble';

const styles = StyleSheet.create({
  row: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  userBubble: {
    backgroundColor: colors.brand.violet600,
    borderBottomRightRadius: radius.sm / 2,
  },
  assistantBubble: {
    backgroundColor: colors.bg.elevated,
    borderBottomLeftRadius: radius.sm / 2,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  userText: {
    color: colors.text.inverse,
    fontSize: typography.size.base,
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
  },
  paragraph: {
    color: colors.text.primary,
    fontSize: typography.size.base,
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
    marginBottom: 2,
  },
  bold: {
    fontWeight: typography.weight.bold,
  },
  bulletRow: {
    flexDirection: 'row',
    paddingLeft: spacing.sm,
    marginBottom: 2,
  },
  bulletDot: {
    color: colors.text.secondary,
    fontSize: typography.size.base,
    marginRight: spacing.sm,
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
  },
  bulletText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.size.base,
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
  },
  timestamp: {
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
  timestampUser: {
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'right',
  },
  timestampAssistant: {
    color: colors.text.muted,
  },
  toolCalls: {
    marginBottom: spacing.sm,
  },
});
