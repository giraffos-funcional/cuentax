/**
 * CUENTAX Mobile — Card Component
 * White card with border and shadow matching web --cx-bg-surface.
 */

import React, { type ReactNode } from 'react';
import { View, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing, shadows } from '@/theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  padded?: boolean;
}

export function Card({ children, style, onPress, padded = true }: CardProps) {
  const flatStyle = Array.isArray(style) ? style : style ? [style] : [];
  const cardStyles: ViewStyle[] = [
    styles.card,
    padded ? styles.padded : undefined,
    ...flatStyle,
  ].filter(Boolean) as ViewStyle[];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...cardStyles,
          pressed ? styles.pressed : undefined,
        ]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyles}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border.light,
    ...shadows.sm,
  },
  padded: {
    padding: spacing.base,
  },
  pressed: {
    opacity: 0.9,
    backgroundColor: colors.hover.bg,
  },
});
