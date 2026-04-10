/**
 * DTE Card — list item showing document type, folio, receptor, amount, status.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Card, Badge } from '@/components/ui';
import { StatusBadge } from './StatusBadge';
import { formatCLP, formatRelativeDate } from '@/lib/formatters';
import { DTE_TYPE_SHORT } from '@/lib/dte-types';
import type { DTE } from '@/lib/dte-types';
import { colors, spacing, typography } from '@/theme';

interface DTECardProps {
  dte: DTE;
}

const TYPE_VARIANT: Record<number, 'violet' | 'info' | 'warning' | 'error'> = {
  33: 'violet',
  34: 'info',
  39: 'info',
  41: 'info',
  56: 'warning',
  61: 'error',
};

export const DTECard = memo(function DTECard({ dte }: DTECardProps) {
  const typeLabel = DTE_TYPE_SHORT[dte.tipo_dte] ?? `Tipo ${dte.tipo_dte}`;
  const typeVariant = TYPE_VARIANT[dte.tipo_dte] ?? 'neutral';

  return (
    <Card
      onPress={() => router.push(`/(stacks)/dte/${dte.id}`)}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <Badge label={typeLabel} variant={typeVariant} />
        <StatusBadge status={dte.status} />
      </View>

      <View style={styles.mainRow}>
        <View style={styles.info}>
          <Text style={styles.folio}>N.{dte.folio}</Text>
          <Text style={styles.receptor} numberOfLines={1}>
            {dte.razon_social_receptor}
          </Text>
        </View>
        <Text style={styles.amount}>{formatCLP(dte.monto_total)}</Text>
      </View>

      <Text style={styles.date}>{formatRelativeDate(dte.fecha)}</Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  folio: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  receptor: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
    marginTop: 2,
  },
  amount: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  date: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
});
