/**
 * CUENTAX Mobile — Button Component
 * Primary (violet gradient), Secondary (outline), Danger variants.
 * Haptic feedback on press.
 */

import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const SIZES: Record<ButtonSize, { height: number; paddingH: number; fontSize: number }> = {
  sm: { height: 36, paddingH: spacing.md, fontSize: typography.size.sm },
  md: { height: 48, paddingH: spacing.lg, fontSize: typography.size.base },
  lg: { height: 56, paddingH: spacing.xl, fontSize: typography.size.md },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
}: ButtonProps) {
  const sizeConfig = SIZES[size];

  const handlePress = async () => {
    if (disabled || loading) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const containerStyle: ViewStyle[] = [
    styles.base,
    {
      height: sizeConfig.height,
      paddingHorizontal: sizeConfig.paddingH,
    },
    variant === 'primary' ? styles.primary : undefined,
    variant === 'secondary' ? styles.secondary : undefined,
    variant === 'outline' ? styles.outline : undefined,
    variant === 'ghost' ? styles.ghost : undefined,
    variant === 'danger' ? styles.danger : undefined,
    (disabled || loading) ? styles.disabled : undefined,
    style,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    styles.text,
    { fontSize: sizeConfig.fontSize },
    variant === 'primary' ? styles.primaryText : undefined,
    variant === 'secondary' ? styles.secondaryText : undefined,
    variant === 'outline' ? styles.outlineText : undefined,
    variant === 'ghost' ? styles.ghostText : undefined,
    variant === 'danger' ? styles.dangerText : undefined,
  ].filter(Boolean) as TextStyle[];

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !disabled ? styles.pressed : undefined,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#ffffff' : colors.brand.violet600}
        />
      ) : (
        <>
          {icon}
          <Text style={textStyle}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.brand.violet600,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  secondary: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.brand.violet600,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: colors.status.error.bg,
    borderWidth: 1,
    borderColor: colors.status.error.border,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  text: {
    fontWeight: typography.weight.semibold,
  },
  primaryText: {
    color: colors.text.inverse,
  },
  secondaryText: {
    color: colors.text.secondary,
  },
  outlineText: {
    color: colors.brand.violet600,
  },
  ghostText: {
    color: colors.brand.violet600,
  },
  dangerText: {
    color: colors.status.error.text,
  },
});
