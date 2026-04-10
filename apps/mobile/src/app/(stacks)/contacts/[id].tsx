/**
 * Contact Detail/Edit Screen — view, edit, delete with recent DTEs.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, Card, Button, Input, Avatar, Divider, LoadingSpinner } from '@/components/ui';
import { DTECard } from '@/components/dte/DTECard';
import { useContact, useUpdateContact, useDeleteContact } from '@/hooks/use-contacts';
import { useDTEs } from '@/hooks/use-dte';
import { formatRUT, validateRUT } from '@/lib/formatters';
import type { Contact } from '@/lib/dte-types';
import { colors, spacing, typography, radius } from '@/theme';

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contactId = Number(id);

  const { data: contact, isLoading } = useContact(contactId);
  const updateMutation = useUpdateContact();
  const deleteMutation = useDeleteContact();

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load recent DTEs for this contact
  const { data: dteData } = useDTEs({});

  useEffect(() => {
    if (contact) {
      setForm({
        rut: contact.rut,
        razon_social: contact.razon_social,
        giro: contact.giro ?? '',
        direccion: contact.direccion ?? '',
        comuna: contact.comuna ?? '',
        email: contact.email ?? '',
        telefono: contact.telefono ?? '',
      });
    }
  }, [contact]);

  const recentDTEs = (dteData?.pages.flatMap((p) => p.data) ?? [])
    .filter((d) => d.rut_receptor === contact?.rut)
    .slice(0, 5);

  const handleSave = useCallback(async () => {
    const errs: Record<string, string> = {};
    if (!form.razon_social?.trim()) errs.razon_social = 'Requerido';
    if (form.rut && !validateRUT(form.rut)) errs.rut = 'RUT invalido';
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: contactId,
        data: form,
      });
      setIsEditing(false);
      setErrors({});
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el contacto');
    }
  }, [form, contactId, updateMutation]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Eliminar Contacto',
      `Eliminar a ${contact?.razon_social}? Esta accion no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(contactId);
              router.back();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el contacto');
            }
          },
        },
      ],
    );
  }, [contact, contactId, deleteMutation]);

  if (isLoading || !contact) {
    return (
      <Screen>
        <Header title="Contacto" showBack />
        <LoadingSpinner />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title={contact.razon_social}
        showBack
        rightAction={
          !isEditing ? (
            <Button
              title="Editar"
              variant="ghost"
              size="sm"
              onPress={() => setIsEditing(true)}
            />
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar header */}
        <View style={styles.avatarSection}>
          <Avatar name={contact.razon_social} size={72} />
          <Text style={styles.name}>{contact.razon_social}</Text>
          <Text style={styles.rut}>{formatRUT(contact.rut)}</Text>
        </View>

        {/* Contact info / edit form */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Informacion</Text>

          {isEditing ? (
            <View style={styles.form}>
              <Input
                label="RUT"
                value={form.rut ?? ''}
                onChangeText={(t) => { setForm((f) => ({ ...f, rut: t })); setErrors((e) => ({ ...e, rut: '' })); }}
                error={errors.rut}
              />
              <Input
                label="Razon Social"
                value={form.razon_social ?? ''}
                onChangeText={(t) => { setForm((f) => ({ ...f, razon_social: t })); setErrors((e) => ({ ...e, razon_social: '' })); }}
                error={errors.razon_social}
                containerStyle={styles.fieldGap}
              />
              <Input
                label="Giro"
                value={form.giro ?? ''}
                onChangeText={(t) => setForm((f) => ({ ...f, giro: t }))}
                containerStyle={styles.fieldGap}
              />
              <Input
                label="Direccion"
                value={form.direccion ?? ''}
                onChangeText={(t) => setForm((f) => ({ ...f, direccion: t }))}
                containerStyle={styles.fieldGap}
              />
              <Input
                label="Comuna"
                value={form.comuna ?? ''}
                onChangeText={(t) => setForm((f) => ({ ...f, comuna: t }))}
                containerStyle={styles.fieldGap}
              />
              <Input
                label="Email"
                value={form.email ?? ''}
                onChangeText={(t) => setForm((f) => ({ ...f, email: t }))}
                keyboardType="email-address"
                autoCapitalize="none"
                containerStyle={styles.fieldGap}
              />
              <Input
                label="Telefono"
                value={form.telefono ?? ''}
                onChangeText={(t) => setForm((f) => ({ ...f, telefono: t }))}
                keyboardType="phone-pad"
                containerStyle={styles.fieldGap}
              />

              <View style={styles.editActions}>
                <Button
                  title="Cancelar"
                  variant="outline"
                  onPress={() => {
                    setIsEditing(false);
                    setForm({
                      rut: contact.rut,
                      razon_social: contact.razon_social,
                      giro: contact.giro ?? '',
                      direccion: contact.direccion ?? '',
                      comuna: contact.comuna ?? '',
                      email: contact.email ?? '',
                      telefono: contact.telefono ?? '',
                    });
                    setErrors({});
                  }}
                  style={styles.editBtn}
                />
                <Button
                  title="Guardar"
                  variant="primary"
                  onPress={handleSave}
                  loading={updateMutation.isPending}
                  style={styles.editBtn}
                />
              </View>
            </View>
          ) : (
            <View>
              <InfoRow label="Giro" value={contact.giro} />
              <InfoRow label="Direccion" value={contact.direccion} />
              <InfoRow label="Comuna" value={contact.comuna} />
              <InfoRow label="Email" value={contact.email} />
              <InfoRow label="Telefono" value={contact.telefono} />
            </View>
          )}
        </Card>

        {/* Recent DTEs */}
        {recentDTEs.length > 0 && (
          <View style={styles.dteSection}>
            <Text style={styles.sectionTitle}>DTEs Recientes</Text>
            {recentDTEs.map((dte) => (
              <DTECard key={dte.id} dte={dte} />
            ))}
          </View>
        )}

        {/* Delete */}
        {!isEditing && (
          <Button
            title="Eliminar Contacto"
            variant="danger"
            onPress={handleDelete}
            loading={deleteMutation.isPending}
            style={styles.deleteBtn}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  name: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  rut: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
  },
  section: {
    padding: spacing.base,
  },
  sectionTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  form: {
    gap: spacing.xs,
  },
  fieldGap: {
    marginTop: spacing.xs,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  editBtn: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
  },
  infoLabel: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    flex: 0.35,
  },
  infoValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
    flex: 0.65,
    textAlign: 'right',
  },
  dteSection: {
    marginTop: spacing.md,
  },
  deleteBtn: {
    marginTop: spacing.xl,
  },
});
