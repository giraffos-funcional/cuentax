/**
 * More Tab — grid of feature cards navigating to stack screens.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header } from '@/components/ui';
import { colors, spacing, typography, radius, shadows } from '@/theme';

interface FeatureItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  color: string;
}

const FEATURES: FeatureItem[] = [
  { icon: 'people', label: 'Contactos', route: '/(stacks)/contacts/', color: colors.brand.violet600 },
  { icon: 'cube', label: 'Productos', route: '/(stacks)/contacts/', color: colors.brand.indigo500 },
  { icon: 'document-text', label: 'Cotizaciones', route: '/(stacks)/contacts/', color: '#0891b2' },
  { icon: 'bar-chart', label: 'Reportes', route: '/(stacks)/contacts/', color: '#059669' },
  { icon: 'settings', label: 'Configuracion', route: '/(stacks)/settings', color: '#64748b' },
];

export default function MoreScreen() {
  return (
    <Screen>
      <Header title="Mas" />
      <ScrollView contentContainerStyle={styles.grid}>
        {FEATURES.map((feature) => (
          <Pressable
            key={feature.label}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => router.push(feature.route as never)}
            accessibilityRole="button"
            accessibilityLabel={feature.label}
          >
            <View style={[styles.iconContainer, { backgroundColor: feature.color + '15' }]}>
              <Ionicons name={feature.icon} size={28} color={feature.color} />
            </View>
            <Text style={styles.label}>{feature.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.base,
    gap: spacing.md,
  },
  card: {
    width: '47%',
    backgroundColor: colors.bg.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    textAlign: 'center',
  },
});
