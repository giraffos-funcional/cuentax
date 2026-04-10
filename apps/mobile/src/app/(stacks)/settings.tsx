/**
 * Settings Screen — profile, security, notifications, SII status, folios, about.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert, Linking } from 'react-native';
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Screen, Header, Card, Button, Divider, Avatar, Badge } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import * as secureStorage from '@/lib/secure-storage';
import { isBiometricAvailable, getBiometricType } from '@/lib/biometrics';
import { formatRUT } from '@/lib/formatters';
import { colors, spacing, typography, radius } from '@/theme';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometria');
  const [pushEnabled, setPushEnabled] = useState(true);

  useEffect(() => {
    async function checkBiometrics() {
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        const type = await getBiometricType();
        setBiometricLabel(type === 'facial' ? 'Face ID' : type === 'fingerprint' ? 'Touch ID' : 'Biometria');
        const enabled = await secureStorage.isBiometricEnabled();
        setBiometricEnabled(enabled);
      }
    }
    checkBiometrics();
  }, []);

  const handleBiometricToggle = useCallback(async (value: boolean) => {
    setBiometricEnabled(value);
    await secureStorage.setBiometricEnabled(value);
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Cerrar Sesion', 'Seguro que quieres cerrar sesion?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar Sesion',
        style: 'destructive',
        onPress: async () => {
          await secureStorage.clearAll();
          clearAuth();
          router.replace('/(auth)/login' as never);
        },
      },
    ]);
  }, [clearAuth]);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <Header title="Configuracion" showBack />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile */}
        <Card style={styles.profileCard}>
          <Avatar name={user?.name ?? 'U'} size={56} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name ?? 'Usuario'}</Text>
            <Text style={styles.profileEmail}>{user?.email ?? ''}</Text>
          </View>
        </Card>

        {/* Company */}
        <Card style={styles.section}>
          <SectionHeader icon="business" title="Empresa" />
          <SettingRow label="Nombre" value={user?.company_name ?? '-'} />
          <SettingRow label="RUT" value={user?.company_rut ? formatRUT(user.company_rut) : '-'} />

          {(user?.companies?.length ?? 0) > 1 && (
            <>
              <Divider />
              <Text style={styles.companySwitchLabel}>Cambiar empresa</Text>
              {user?.companies.map((company) => (
                <Pressable
                  key={company.id}
                  style={[
                    styles.companyRow,
                    company.id === user?.company_id && styles.companyRowActive,
                  ]}
                  onPress={() => {
                    Alert.alert('Cambiar Empresa', `Cambiar a ${company.name}? La app se reiniciara.`);
                  }}
                >
                  <Text style={[
                    styles.companyName,
                    company.id === user?.company_id && styles.companyNameActive,
                  ]}>
                    {company.name}
                  </Text>
                  <Text style={styles.companyRut}>{formatRUT(company.rut)}</Text>
                  {company.id === user?.company_id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.brand.violet600} />
                  )}
                </Pressable>
              ))}
            </>
          )}
        </Card>

        {/* Security */}
        <Card style={styles.section}>
          <SectionHeader icon="shield-checkmark" title="Seguridad" />

          {biometricAvailable && (
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>{biometricLabel}</Text>
                <Text style={styles.toggleHint}>Desbloquear la app con {biometricLabel}</Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: colors.border.light, true: colors.brand.violet400 }}
                thumbColor={biometricEnabled ? colors.brand.violet600 : colors.bg.surface}
              />
            </View>
          )}

          <Pressable style={styles.linkRow} onPress={() => Alert.alert('Cambiar Contrasena', 'Proximamente')}>
            <Text style={styles.linkText}>Cambiar contrasena</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
          </Pressable>
        </Card>

        {/* Notifications */}
        <Card style={styles.section}>
          <SectionHeader icon="notifications" title="Notificaciones" />
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Notificaciones push</Text>
              <Text style={styles.toggleHint}>Recibir alertas de DTEs y SII</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: colors.border.light, true: colors.brand.violet400 }}
              thumbColor={pushEnabled ? colors.brand.violet600 : colors.bg.surface}
            />
          </View>
        </Card>

        {/* SII Status */}
        <Card style={styles.section}>
          <SectionHeader icon="cloud-done" title="Estado SII" />
          <View style={styles.siiRow}>
            <Text style={styles.siiLabel}>Certificado Digital</Text>
            <Badge label="Activo" variant="success" />
          </View>
          <View style={styles.siiRow}>
            <Text style={styles.siiLabel}>Conectividad SII</Text>
            <Badge label="Conectado" variant="success" />
          </View>
        </Card>

        {/* Folios */}
        <Card style={styles.section}>
          <SectionHeader icon="layers" title="Folios Disponibles" />
          <FolioRow tipo="Factura (33)" cantidad="250" />
          <FolioRow tipo="Boleta (39)" cantidad="1.000" />
          <FolioRow tipo="Nota Credito (61)" cantidad="50" />
          <FolioRow tipo="Nota Debito (56)" cantidad="50" />
        </Card>

        {/* About */}
        <Card style={styles.section}>
          <SectionHeader icon="information-circle" title="Acerca de" />
          <SettingRow label="Version" value={`v${appVersion}`} />
          <Pressable
            style={styles.linkRow}
            onPress={() => Linking.openURL('https://cuentax.cl/terminos')}
          >
            <Text style={styles.linkText}>Terminos y condiciones</Text>
            <Ionicons name="open-outline" size={16} color={colors.text.muted} />
          </Pressable>
          <Pressable
            style={styles.linkRow}
            onPress={() => Linking.openURL('https://cuentax.cl/privacidad')}
          >
            <Text style={styles.linkText}>Politica de privacidad</Text>
            <Ionicons name="open-outline" size={16} color={colors.text.muted} />
          </Pressable>
        </Card>

        {/* Logout */}
        <Button
          title="Cerrar Sesion"
          variant="danger"
          size="lg"
          onPress={handleLogout}
          icon={<Ionicons name="log-out-outline" size={20} color={colors.status.error.text} />}
          style={styles.logoutBtn}
        />
      </ScrollView>
    </Screen>
  );
}

function SectionHeader({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={20} color={colors.brand.violet600} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

function FolioRow({ tipo, cantidad }: { tipo: string; cantidad: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{tipo}</Text>
      <Text style={styles.folioValue}>{cantidad}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.lg,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  profileEmail: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  section: {
    padding: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
  },
  settingLabel: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
  settingValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  },
  folioValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.brand.violet600,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  },
  toggleHint: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
  },
  linkText: {
    fontSize: typography.size.base,
    color: colors.brand.violet600,
    fontWeight: typography.weight.medium,
  },
  companySwitchLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  companyRowActive: {
    backgroundColor: colors.active.bg,
  },
  companyName: {
    flex: 1,
    fontSize: typography.size.base,
    color: colors.text.primary,
  },
  companyNameActive: {
    fontWeight: typography.weight.semibold,
    color: colors.active.text,
  },
  companyRut: {
    fontSize: typography.size.sm,
    color: colors.text.muted,
  },
  siiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
  },
  siiLabel: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
  logoutBtn: {
    marginTop: spacing.lg,
  },
});
