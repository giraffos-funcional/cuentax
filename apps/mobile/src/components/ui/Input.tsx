/**
 * CUENTAX Mobile — Input Component
 * TextInput with label, error state, icon support.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  icon,
  containerStyle,
  style,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          isFocused ? styles.inputFocused : undefined,
          error ? styles.inputError : undefined,
        ]}
      >
        {icon && <View style={styles.iconWrapper}>{icon}</View>}
        <TextInput
          style={[styles.input, icon ? styles.inputWithIcon : undefined, style]}
          placeholderTextColor={colors.text.muted}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          accessibilityLabel={label}
          accessibilityState={{ disabled: props.editable === false }}
          {...props}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.input,
    minHeight: 48,
  },
  inputFocused: {
    borderColor: colors.brand.violet500,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  inputError: {
    borderColor: colors.status.error.text,
  },
  iconWrapper: {
    paddingLeft: spacing.md,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.size.base,
    color: colors.text.primary,
  },
  inputWithIcon: {
    paddingLeft: spacing.sm,
  },
  error: {
    fontSize: typography.size.xs,
    color: colors.status.error.text,
    marginTop: 2,
  },
});
