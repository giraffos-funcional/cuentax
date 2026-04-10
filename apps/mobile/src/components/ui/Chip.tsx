import React from 'react';
import { Pressable, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Chip({ label, selected = false, onPress, style }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.text, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  selected: {
    backgroundColor: colors.active.bg,
    borderColor: colors.active.border,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text.secondary,
  },
  selectedText: {
    color: colors.active.text,
  },
});
