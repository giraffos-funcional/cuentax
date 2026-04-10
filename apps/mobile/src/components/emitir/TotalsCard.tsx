/**
 * Totals Card — auto-calculated neto/IVA/exento/total display.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, Divider } from '@/components/ui';
import { formatCLP } from '@/lib/formatters';
import type { DTEItem } from '@/lib/dte-types';
import { colors, spacing, typography } from '@/theme';

interface TotalsCardProps {
  items: DTEItem[];
  tipoDte?: number;
}

export interface Totals {
  neto: number;
  exento: number;
  iva: number;
  total: number;
}

export function calculateTotals(items: DTEItem[], tipoDte?: number): Totals {
  let neto = 0;
  let exento = 0;

  for (const item of items) {
    const subtotal = item.cantidad * item.precio_unitario;
    const discount = (item.descuento_porcentaje ?? 0) / 100;
    const lineTotal = Math.round(subtotal * (1 - discount));

    if (item.exento || tipoDte === 34 || tipoDte === 41) {
      exento += lineTotal;
    } else {
      neto += lineTotal;
    }
  }

  const iva = Math.round(neto * 0.19);
  const total = neto + iva + exento;

  return { neto, exento, iva, total };
}

export function TotalsCard({ items, tipoDte }: TotalsCardProps) {
  const totals = useMemo(() => calculateTotals(items, tipoDte), [items, tipoDte]);

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Resumen</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Neto</Text>
        <Text style={styles.value}>{formatCLP(totals.neto)}</Text>
      </View>

      {totals.exento > 0 && (
        <View style={styles.row}>
          <Text style={styles.label}>Exento</Text>
          <Text style={styles.value}>{formatCLP(totals.exento)}</Text>
        </View>
      )}

      <View style={styles.row}>
        <Text style={styles.label}>IVA (19%)</Text>
        <Text style={styles.value}>{formatCLP(totals.iva)}</Text>
      </View>

      <Divider />

      <View style={styles.row}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatCLP(totals.total)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.base,
  },
  title: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
  },
  value: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  },
  totalLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  totalValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.brand.violet600,
  },
});
