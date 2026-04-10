/**
 * GastoCard -- Expense list item with category icon, amount, and status.
 */

import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, shadows } from '@/theme';
import { Badge } from '@/components/ui';
import { formatCLP, formatDate } from '@/lib/formatters';
import { CATEGORIA_MAP, TIPO_DOC_LABELS } from '@/constants/gastos';
import type { Gasto } from '@/hooks/use-gastos';

interface GastoCardProps {
  gasto: Gasto;
  onPress: (gasto: Gasto) => void;
}

export function GastoCard({ gasto, onPress }: GastoCardProps) {
  const cat = CATEGORIA_MAP[gasto.categoria];
  const catIcon = cat?.icon ?? 'receipt-outline';
  const catColor = cat?.color ?? colors.text.muted;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(gasto)}
      activeOpacity={0.7}
      accessibilityLabel={`Gasto ${gasto.emisor_razon_social ?? 'sin emisor'}, ${formatCLP(gasto.monto_total)}`}
    >
      {/* Category icon or photo thumbnail */}
      <View style={[styles.iconContainer, { backgroundColor: `${catColor}15` }]}>
        {gasto.foto_url ? (
          <Image source={{ uri: gasto.foto_url }} style={styles.thumbnail} />
        ) : (
          <Ionicons name={catIcon as keyof typeof Ionicons.glyphMap} size={22} color={catColor} />
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.emisor} numberOfLines={1}>
            {gasto.emisor_razon_social || 'Sin emisor'}
          </Text>
          <Text style={styles.amount}>{formatCLP(gasto.monto_total)}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {TIPO_DOC_LABELS[gasto.tipo_documento] ?? gasto.tipo_documento}
          </Text>
          <Text style={styles.metaDot}>-</Text>
          <Text style={styles.metaText}>{formatDate(gasto.fecha_documento)}</Text>
        </View>

        <View style={styles.bottomRow}>
          <Badge
            label={cat?.label ?? gasto.categoria}
            variant="violet"
          />
          {gasto.verificado ? (
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={12} color={colors.status.ok.text} />
              <Text style={[styles.statusText, { color: colors.status.ok.text }]}>Verificado</Text>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <Ionicons name="time-outline" size={12} color={colors.status.warn.text} />
              <Text style={[styles.statusText, { color: colors.status.warn.text }]}>Pendiente</Text>
            </View>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emisor: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  amount: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
  metaDot: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: typography.weight.medium,
  },
});
