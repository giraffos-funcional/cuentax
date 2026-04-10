import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '@/theme';

export interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  message?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ size = 'large', color = colors.brand.violet600, message, fullScreen }: LoadingSpinnerProps) {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      <ActivityIndicator size={size} color={color} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg.base,
    zIndex: 10,
  },
  message: {
    marginTop: spacing.md,
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
});
