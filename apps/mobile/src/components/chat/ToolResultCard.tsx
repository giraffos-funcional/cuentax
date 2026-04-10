/**
 * CUENTAX Mobile — ToolResultCard
 * Shows a small card when AI calls a tool (e.g. get_ventas_periodo).
 */

import { memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ToolCallInfo } from '@/stores/chat.store';
import { colors, radius, spacing, typography } from '@/theme';

/** Human-readable labels for known tool names */
const TOOL_LABELS: Record<string, string> = {
  get_ventas_periodo: 'Consultando ventas',
  get_compras_periodo: 'Consultando compras',
  get_balance_iva: 'Calculando balance IVA',
  get_clientes_top: 'Buscando mejores clientes',
  get_folios_disponibles: 'Verificando folios',
  get_gastos_periodo: 'Consultando gastos',
  get_dashboard_stats: 'Obteniendo estadísticas',
  get_flujo_caja: 'Consultando flujo de caja',
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? `Ejecutando ${name}`;
}

interface ToolResultCardProps {
  toolCall: ToolCallInfo;
}

export const ToolResultCard = memo<ToolResultCardProps>(({ toolCall }) => {
  const label = getToolLabel(toolCall.name);
  const isRunning = toolCall.status === 'running';
  const isDone = toolCall.status === 'done';
  const isError = toolCall.status === 'error';

  return (
    <View style={styles.card}>
      <View style={styles.iconContainer}>
        {isRunning && (
          <ActivityIndicator size="small" color={colors.brand.violet500} />
        )}
        {isDone && (
          <Ionicons
            name="checkmark-circle"
            size={18}
            color={colors.status.ok.text}
          />
        )}
        {isError && (
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.status.error.text}
          />
        )}
      </View>
      <Text
        style={[
          styles.label,
          isDone && styles.labelDone,
          isError && styles.labelError,
        ]}
        numberOfLines={1}
      >
        {label}
        {isRunning ? '...' : ''}
      </Text>
    </View>
  );
});

ToolResultCard.displayName = 'ToolResultCard';

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.base,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  iconContainer: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  label: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium,
  },
  labelDone: {
    color: colors.status.ok.text,
  },
  labelError: {
    color: colors.status.error.text,
  },
});
