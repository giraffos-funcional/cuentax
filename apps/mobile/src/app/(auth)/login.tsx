/**
 * CUENTAX Mobile — Login Screen
 * Email + password fields, CuentaX violet branding, biometric option.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useLogin, useBiometricUnlock } from '@/hooks/use-auth';
import { isBiometricAvailable, getBiometricType, type BiometricType } from '@/lib/biometrics';
import * as secureStorage from '@/lib/secure-storage';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography, radius } from '@/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>('none');

  const loginMutation = useLogin();
  const biometricMutation = useBiometricUnlock();

  useEffect(() => {
    checkBiometrics();
  }, []);

  async function checkBiometrics() {
    const available = await isBiometricAvailable();
    const enabled = await secureStorage.isBiometricEnabled();
    const hasRefresh = await secureStorage.getRefreshToken();

    if (available && enabled && hasRefresh) {
      setBiometricAvailable(true);
      const type = await getBiometricType();
      setBiometricType(type);
    }
  }

  function handleLogin() {
    if (!email.trim() || !password.trim()) return;
    loginMutation.mutate({ email: email.trim(), password });
  }

  function handleBiometric() {
    biometricMutation.mutate();
  }

  const biometricIcon = biometricType === 'facial' ? 'scan-outline' : 'finger-print-outline';
  const biometricLabel = biometricType === 'facial' ? 'Face ID' : 'Huella digital';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Logo / Branding */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>CX</Text>
            </View>
          </View>
          <Text style={styles.title}>CuentaX</Text>
          <Text style={styles.subtitle}>Contabilidad inteligente para Chile</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="Correo electronico"
            placeholder="tu@empresa.cl"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            icon={<Ionicons name="mail-outline" size={18} color={colors.text.muted} />}
          />

          <View style={styles.passwordContainer}>
            <Input
              label="Contrasena"
              placeholder="Tu contrasena"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              icon={<Ionicons name="lock-closed-outline" size={18} color={colors.text.muted} />}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
              accessibilityLabel={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              hitSlop={8}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.text.muted}
              />
            </Pressable>
          </View>

          {(loginMutation.error || biometricMutation.error) && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.status.error.text} />
              <Text style={styles.errorText}>
                {loginMutation.error
                  ? 'Credenciales invalidas. Intenta nuevamente.'
                  : 'Error al autenticar. Intenta nuevamente.'}
              </Text>
            </View>
          )}

          <Button
            title="Iniciar Sesion"
            onPress={handleLogin}
            loading={loginMutation.isPending}
            disabled={!email.trim() || !password.trim()}
            size="lg"
          />

          {/* Biometric Login */}
          {biometricAvailable && (
            <View style={styles.biometricSection}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>o</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={styles.biometricButton}
                onPress={handleBiometric}
                disabled={biometricMutation.isPending}
                accessibilityLabel={`Desbloquear con ${biometricLabel}`}
              >
                <Ionicons name={biometricIcon} size={28} color={colors.brand.violet600} />
                <Text style={styles.biometricText}>
                  Desbloquear con {biometricLabel}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Giraffos {'·'} CuentaX v1.0.0
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  logoContainer: {
    marginBottom: spacing.base,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.brand.violet600,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoText: {
    fontSize: 28,
    fontWeight: typography.weight.bold,
    color: colors.text.inverse,
    letterSpacing: -1,
  },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
  },
  form: {
    gap: spacing.base,
  },
  passwordContainer: {
    position: 'relative',
  },
  eyeButton: {
    position: 'absolute',
    right: spacing.md,
    top: 32,
    padding: spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.status.error.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.status.error.border,
  },
  errorText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.status.error.text,
  },
  biometricSection: {
    marginTop: spacing.sm,
    gap: spacing.base,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.light,
  },
  dividerText: {
    fontSize: typography.size.sm,
    color: colors.text.muted,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.surface,
  },
  biometricText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.brand.violet600,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing['3xl'],
  },
  footerText: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
});
