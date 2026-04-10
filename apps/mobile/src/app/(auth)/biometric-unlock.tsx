/**
 * CUENTAX Mobile — Biometric Unlock Screen
 * Face ID / fingerprint prompt with password fallback.
 */

import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBiometricUnlock } from '@/hooks/use-auth';
import { getBiometricType } from '@/lib/biometrics';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography, radius } from '@/theme';

export default function BiometricUnlockScreen() {
  const biometricMutation = useBiometricUnlock();
  const [biometricIcon, setBiometricIcon] = React.useState<'finger-print-outline' | 'scan-outline'>('finger-print-outline');

  useEffect(() => {
    getBiometricType().then((type) => {
      setBiometricIcon(type === 'facial' ? 'scan-outline' : 'finger-print-outline');
    });
    // Auto-trigger biometric on mount
    biometricMutation.mutate();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name={biometricIcon} size={64} color={colors.brand.violet600} />
        </View>

        <Text style={styles.title}>Desbloquear CuentaX</Text>
        <Text style={styles.subtitle}>
          Usa tu biometria para acceder rapidamente
        </Text>

        {biometricMutation.isPending && (
          <View style={styles.loadingContainer}>
            <LoadingSpinner size="small" />
          </View>
        )}

        {biometricMutation.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              No se pudo verificar tu identidad. Intenta de nuevo o usa tu contrasena.
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title="Intentar de nuevo"
            onPress={() => biometricMutation.mutate()}
            loading={biometricMutation.isPending}
            size="lg"
          />

          <Pressable
            style={styles.fallbackButton}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityLabel="Usar contrasena"
          >
            <Text style={styles.fallbackText}>Usar contrasena</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.active.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  loadingContainer: {
    marginBottom: spacing.lg,
  },
  errorBox: {
    padding: spacing.base,
    backgroundColor: colors.status.error.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.status.error.border,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.status.error.text,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: spacing.base,
  },
  fallbackButton: {
    alignItems: 'center',
    padding: spacing.md,
  },
  fallbackText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.brand.violet600,
  },
});
