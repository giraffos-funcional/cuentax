import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radius, typography } from '@/theme';

interface AvatarProps {
  name: string;
  size?: number;
  style?: ViewStyle;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();
}

function getColor(name: string): string {
  const palette = [
    colors.brand.violet600,
    colors.brand.indigo500,
    '#0891b2',
    '#0d9488',
    '#059669',
    '#d97706',
    '#dc2626',
    '#db2777',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

export function Avatar({ name, size = 40, style }: AvatarProps) {
  const bg = getColor(name);
  const fontSize = size * 0.38;

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
      ]}
      accessibilityLabel={name}
    >
      <Text style={[styles.text, { fontSize }]}>{getInitials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.text.inverse,
    fontWeight: typography.weight.semibold,
  },
});
