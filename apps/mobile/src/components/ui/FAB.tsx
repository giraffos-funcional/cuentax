import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '@/theme';

interface FABProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

export function FAB({ onPress, icon = 'add', style }: FABProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Agregar"
    >
      <Ionicons name={icon} size={28} color={colors.text.inverse} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand.violet600,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.violet,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
});
