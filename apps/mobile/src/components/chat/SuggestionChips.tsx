/**
 * CUENTAX Mobile — SuggestionChips
 * 2-column grid of quick question suggestions for the AI chat.
 */

import { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';

const SUGGESTIONS = [
  { text: '¿Cuánto vendí este mes?', icon: 'trending-up-outline' as const },
  { text: '¿Cuál es mi balance de IVA?', icon: 'calculator-outline' as const },
  { text: '¿Quiénes son mis mejores clientes?', icon: 'people-outline' as const },
  { text: '¿Cuántos folios me quedan?', icon: 'document-text-outline' as const },
  { text: '¿Cómo emito una factura?', icon: 'help-circle-outline' as const },
  { text: 'Resumen de gastos del mes', icon: 'wallet-outline' as const },
];

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

export const SuggestionChips = memo<SuggestionChipsProps>(({ onSelect }) => {
  const handlePress = useCallback(
    (text: string) => {
      onSelect(text);
    },
    [onSelect],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name="sparkles"
          size={20}
          color={colors.brand.violet500}
        />
        <Text style={styles.title}>¿En qué puedo ayudarte?</Text>
      </View>
      <Text style={styles.subtitle}>
        Pregúntame sobre tu negocio, ventas, gastos o documentos tributarios.
      </Text>
      <View style={styles.grid}>
        {SUGGESTIONS.map((suggestion) => (
          <TouchableOpacity
            key={suggestion.text}
            style={styles.chip}
            onPress={() => handlePress(suggestion.text)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={suggestion.icon}
              size={16}
              color={colors.brand.violet600}
              style={styles.chipIcon}
            />
            <Text style={styles.chipText} numberOfLines={2}>
              {suggestion.text}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

SuggestionChips.displayName = 'SuggestionChips';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.brand.violet400,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chipIcon: {
    marginRight: spacing.sm,
  },
  chipText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.brand.violet700,
    fontWeight: typography.weight.medium,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
});
