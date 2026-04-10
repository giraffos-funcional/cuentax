/**
 * CUENTAX Mobile — Header Component
 * Custom header with optional back button and title.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography } from '@/theme';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export function Header({ title, subtitle, showBack = false, rightAction }: HeaderProps) {
  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {showBack && (
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
          </Pressable>
        )}
      </View>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg.base,
  },
  left: {
    width: 40,
    alignItems: 'flex-start',
  },
  right: {
    width: 40,
    alignItems: 'flex-end',
  },
  backButton: {
    padding: spacing.xs,
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 2,
  },
});
