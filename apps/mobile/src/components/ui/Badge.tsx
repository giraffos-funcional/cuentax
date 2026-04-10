/**
 * CUENTAX Mobile — Badge Component
 * Status badges for DTE states and general use.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography, spacing } from '@/theme';
import { SII_STATUS_COLORS, SII_STATUS_LABELS } from '@/constants';

export type BadgeVariant = 'ok' | 'warn' | 'error' | 'info' | 'neutral' | 'success' | 'warning' | 'violet';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const VARIANT_COLORS: Record<BadgeVariant, { text: string; bg: string; border: string }> = {
  ok: { text: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
  success: { text: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
  warn: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  warning: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  error: { text: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  info: { text: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  neutral: { text: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  violet: { text: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
};

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const variantColors = VARIANT_COLORS[variant];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: variantColors.bg,
          borderColor: variantColors.border,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text style={[styles.text, { color: variantColors.text }]}>{label}</Text>
    </View>
  );
}

interface DTEStatusBadgeProps {
  status: string;
}

export function DTEStatusBadge({ status }: DTEStatusBadgeProps) {
  const statusColors = SII_STATUS_COLORS[status] ?? SII_STATUS_COLORS.borrador;
  const label = SII_STATUS_LABELS[status] ?? status;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: statusColors.bg,
          borderColor: statusColors.border,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Estado: ${label}`}
    >
      <Text style={[styles.text, { color: statusColors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
});
