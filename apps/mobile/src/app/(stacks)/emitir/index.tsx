/**
 * DTE Emission Wizard — multi-step flow: Tipo > Receptor > Lineas > Resumen > Confirmar.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, Card, Button, Input } from '@/components/ui';
import { StepIndicator } from '@/components/emitir/StepIndicator';
import { ContactSelector } from '@/components/emitir/ContactSelector';
import { LineItemEditor } from '@/components/emitir/LineItemEditor';
import { TotalsCard, calculateTotals } from '@/components/emitir/TotalsCard';
import { useEmitirDTE } from '@/hooks/use-dte';
import { formatCLP, formatRUT, validateRUT, cleanRUT } from '@/lib/formatters';
import { EMITTABLE_TYPES, DTE_TYPE_LABELS } from '@/lib/dte-types';
import type { Contact, DTEItem, EmitirDTEPayload } from '@/lib/dte-types';
import { colors, spacing, typography, radius, shadows } from '@/theme';

const STEPS = ['Tipo', 'Receptor', 'Detalle', 'Resumen', 'Confirmar'];

interface ReceptorData {
  rut: string;
  razon_social: string;
  giro: string;
  direccion: string;
  comuna: string;
}

export default function EmitirWizard() {
  const [step, setStep] = useState(0);
  const [tipoDte, setTipoDte] = useState<number>(0);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [manualReceptor, setManualReceptor] = useState(false);
  const [receptor, setReceptor] = useState<ReceptorData>({
    rut: '',
    razon_social: '',
    giro: '',
    direccion: '',
    comuna: '',
  });
  const [items, setItems] = useState<DTEItem[]>([]);
  const [receptorErrors, setReceptorErrors] = useState<Partial<Record<keyof ReceptorData, string>>>({});

  const emitirMutation = useEmitirDTE();

  const totals = useMemo(() => calculateTotals(items, tipoDte), [items, tipoDte]);

  const effectiveReceptor = useMemo((): ReceptorData => {
    if (selectedContact) {
      return {
        rut: selectedContact.rut,
        razon_social: selectedContact.razon_social,
        giro: selectedContact.giro ?? '',
        direccion: selectedContact.direccion ?? '',
        comuna: selectedContact.comuna ?? '',
      };
    }
    return receptor;
  }, [selectedContact, receptor]);

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 0: return tipoDte > 0;
      case 1: {
        const r = effectiveReceptor;
        return !!(r.rut && r.razon_social && r.giro);
      }
      case 2: return items.length > 0;
      case 3: return true;
      case 4: return true;
      default: return false;
    }
  }, [step, tipoDte, effectiveReceptor, items]);

  const validateReceptor = useCallback((): boolean => {
    const errors: Partial<Record<keyof ReceptorData, string>> = {};
    const r = manualReceptor ? receptor : effectiveReceptor;

    if (!r.rut) errors.rut = 'RUT es requerido';
    else if (!validateRUT(r.rut)) errors.rut = 'RUT invalido';
    if (!r.razon_social) errors.razon_social = 'Razon social es requerida';
    if (!r.giro) errors.giro = 'Giro es requerido';

    setReceptorErrors(errors);
    return Object.keys(errors).length === 0;
  }, [receptor, effectiveReceptor, manualReceptor]);

  const handleNext = useCallback(() => {
    if (step === 1 && manualReceptor && !validateReceptor()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
  }, [step, manualReceptor, validateReceptor]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep(step - 1);
    else router.back();
  }, [step]);

  const handleEmit = useCallback(async () => {
    const r = effectiveReceptor;
    const payload: EmitirDTEPayload = {
      tipo_dte: tipoDte,
      receptor: {
        rut: cleanRUT(r.rut),
        razon_social: r.razon_social,
        giro: r.giro,
        direccion: r.direccion || undefined,
        comuna: r.comuna || undefined,
      },
      items: items.map((item) => ({
        nombre: item.nombre,
        descripcion: item.descripcion || undefined,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento_porcentaje: item.descuento_porcentaje || undefined,
        exento: item.exento || undefined,
      })),
    };

    try {
      const result = await emitirMutation.mutateAsync(payload);
      if (result.success && result.dte_id) {
        Alert.alert(
          'DTE Emitido',
          `Folio ${result.folio} enviado al SII correctamente.`,
          [{ text: 'Ver Detalle', onPress: () => router.replace(`/(stacks)/dte/${result.dte_id}`) }],
        );
      } else {
        const errorMsg = result.error ?? 'Error desconocido al emitir';
        const details = result.details
          ? Object.entries(result.details).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('\n')
          : '';
        Alert.alert('Error al Emitir', `${errorMsg}${details ? `\n\n${details}` : ''}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error de conexion';
      Alert.alert('Error', message);
    }
  }, [tipoDte, effectiveReceptor, items, emitirMutation]);

  return (
    <Screen>
      <Header
        title="Emitir DTE"
        showBack
        rightAction={
          step > 0 ? (
            <Pressable onPress={handleBack} style={styles.stepBack}>
              <Ionicons name="arrow-back" size={20} color={colors.brand.violet600} />
            </Pressable>
          ) : undefined
        }
      />

      <StepIndicator currentStep={step} totalSteps={STEPS.length} labels={STEPS} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 0: Tipo DTE */}
          {step === 0 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Selecciona el tipo de documento</Text>
              <View style={styles.typeGrid}>
                {EMITTABLE_TYPES.map((type) => {
                  const isSelected = tipoDte === type.code;
                  return (
                    <Card
                      key={type.code}
                      onPress={() => setTipoDte(type.code)}
                      style={isSelected ? [styles.typeCard, styles.typeCardSelected] : styles.typeCard}
                    >
                      <View style={[styles.typeIcon, isSelected && styles.typeIconSelected]}>
                        <Ionicons
                          name={type.icon}
                          size={28}
                          color={isSelected ? colors.text.inverse : colors.brand.violet600}
                        />
                      </View>
                      <Text style={[styles.typeName, isSelected && styles.typeNameSelected]}>
                        {type.name}
                      </Text>
                      <Text style={styles.typeDesc}>{type.description}</Text>
                    </Card>
                  );
                })}
              </View>
            </View>
          )}

          {/* Step 1: Receptor */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Datos del receptor</Text>

              {!manualReceptor ? (
                <ContactSelector
                  onSelect={(contact) => {
                    setSelectedContact(contact);
                    setManualReceptor(false);
                  }}
                  onCreateNew={() => {
                    setSelectedContact(null);
                    setManualReceptor(true);
                  }}
                  selectedContact={selectedContact}
                />
              ) : (
                <View style={styles.manualForm}>
                  <Button
                    title="Buscar contacto existente"
                    variant="ghost"
                    size="sm"
                    onPress={() => setManualReceptor(false)}
                    icon={<Ionicons name="search" size={16} color={colors.brand.violet600} />}
                    style={styles.switchBtn}
                  />
                  <Input
                    label="RUT"
                    value={receptor.rut}
                    onChangeText={(t) => {
                      setReceptor((r) => ({ ...r, rut: t }));
                      setReceptorErrors((e) => ({ ...e, rut: undefined }));
                    }}
                    placeholder="12.345.678-9"
                    error={receptorErrors.rut}
                    keyboardType="default"
                    autoCapitalize="none"
                  />
                  <Input
                    label="Razon Social"
                    value={receptor.razon_social}
                    onChangeText={(t) => {
                      setReceptor((r) => ({ ...r, razon_social: t }));
                      setReceptorErrors((e) => ({ ...e, razon_social: undefined }));
                    }}
                    placeholder="Empresa Ejemplo SpA"
                    error={receptorErrors.razon_social}
                    containerStyle={styles.fieldGap}
                  />
                  <Input
                    label="Giro"
                    value={receptor.giro}
                    onChangeText={(t) => {
                      setReceptor((r) => ({ ...r, giro: t }));
                      setReceptorErrors((e) => ({ ...e, giro: undefined }));
                    }}
                    placeholder="Servicios de Software"
                    error={receptorErrors.giro}
                    containerStyle={styles.fieldGap}
                  />
                  <Input
                    label="Direccion"
                    value={receptor.direccion}
                    onChangeText={(t) => setReceptor((r) => ({ ...r, direccion: t }))}
                    placeholder="Av. Providencia 1234"
                    containerStyle={styles.fieldGap}
                  />
                  <Input
                    label="Comuna"
                    value={receptor.comuna}
                    onChangeText={(t) => setReceptor((r) => ({ ...r, comuna: t }))}
                    placeholder="Providencia"
                    containerStyle={styles.fieldGap}
                  />
                </View>
              )}
            </View>
          )}

          {/* Step 2: Line items */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Lineas de detalle</Text>
              <LineItemEditor items={items} onItemsChange={setItems} />
              {items.length > 0 && (
                <TotalsCard items={items} tipoDte={tipoDte} />
              )}
            </View>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Revisa los datos</Text>

              {/* Document type */}
              <Card style={styles.reviewSection}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewLabel}>Tipo Documento</Text>
                  <Pressable onPress={() => setStep(0)}>
                    <Text style={styles.editLink}>Editar</Text>
                  </Pressable>
                </View>
                <Text style={styles.reviewValue}>
                  {DTE_TYPE_LABELS[tipoDte] ?? `Tipo ${tipoDte}`}
                </Text>
              </Card>

              {/* Receptor */}
              <Card style={styles.reviewSection}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewLabel}>Receptor</Text>
                  <Pressable onPress={() => setStep(1)}>
                    <Text style={styles.editLink}>Editar</Text>
                  </Pressable>
                </View>
                <Text style={styles.reviewValue}>{effectiveReceptor.razon_social}</Text>
                <Text style={styles.reviewSub}>{formatRUT(effectiveReceptor.rut)}</Text>
                <Text style={styles.reviewSub}>{effectiveReceptor.giro}</Text>
              </Card>

              {/* Items */}
              <Card style={styles.reviewSection}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewLabel}>Detalle ({items.length} lineas)</Text>
                  <Pressable onPress={() => setStep(2)}>
                    <Text style={styles.editLink}>Editar</Text>
                  </Pressable>
                </View>
                {items.map((item, i) => (
                  <View key={i} style={styles.reviewItem}>
                    <Text style={styles.reviewItemName} numberOfLines={1}>{item.nombre}</Text>
                    <Text style={styles.reviewItemAmount}>
                      {formatCLP(Math.round(
                        item.cantidad * item.precio_unitario * (1 - (item.descuento_porcentaje ?? 0) / 100)
                      ))}
                    </Text>
                  </View>
                ))}
              </Card>

              <TotalsCard items={items} tipoDte={tipoDte} />
            </View>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <View style={styles.stepContent}>
              <View style={styles.confirmCenter}>
                <View style={styles.confirmIcon}>
                  <Ionicons name="document-text" size={48} color={colors.brand.violet600} />
                </View>
                <Text style={styles.confirmTitle}>
                  {DTE_TYPE_LABELS[tipoDte]}
                </Text>
                <Text style={styles.confirmReceptor}>
                  {effectiveReceptor.razon_social}
                </Text>
                <Text style={styles.confirmTotal}>{formatCLP(totals.total)}</Text>
                <Text style={styles.confirmNote}>
                  Al confirmar, el documento sera firmado y enviado al SII.
                </Text>
              </View>

              {emitirMutation.isError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>
                    {emitirMutation.error?.message ?? 'Error al emitir. Intenta nuevamente.'}
                  </Text>
                </View>
              )}

              <Button
                title={emitirMutation.isPending ? 'Emitiendo...' : 'Emitir DTE'}
                variant="primary"
                size="lg"
                onPress={handleEmit}
                loading={emitirMutation.isPending}
                disabled={emitirMutation.isPending}
                style={styles.emitButton}
              />

              {emitirMutation.isError && (
                <Button
                  title="Reintentar"
                  variant="outline"
                  size="md"
                  onPress={handleEmit}
                  style={styles.retryButton}
                />
              )}
            </View>
          )}
        </ScrollView>

        {/* Navigation buttons */}
        {step < 4 && (
          <View style={styles.navBar}>
            <Button
              title="Atras"
              variant="ghost"
              onPress={handleBack}
            />
            <Button
              title={step === 3 ? 'Confirmar' : 'Siguiente'}
              variant="primary"
              onPress={handleNext}
              disabled={!canAdvance()}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
  },
  stepContent: {
    gap: spacing.md,
  },
  stepTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  stepBack: {
    padding: spacing.xs,
  },

  // Type selection
  typeGrid: {
    gap: spacing.md,
  },
  typeCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  typeCardSelected: {
    borderWidth: 2,
    borderColor: colors.brand.violet600,
    backgroundColor: colors.active.bg,
  },
  typeIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.active.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconSelected: {
    backgroundColor: colors.brand.violet600,
  },
  typeName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  typeNameSelected: {
    color: colors.brand.violet600,
  },
  typeDesc: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },

  // Manual receptor form
  manualForm: {
    gap: spacing.xs,
  },
  switchBtn: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  fieldGap: {
    marginTop: spacing.xs,
  },

  // Review step
  reviewSection: {
    padding: spacing.base,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  reviewLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.secondary,
    textTransform: 'uppercase',
  },
  editLink: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.brand.violet600,
  },
  reviewValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  },
  reviewSub: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  reviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
  },
  reviewItemName: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text.primary,
  },
  reviewItemAmount: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },

  // Confirm step
  confirmCenter: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.md,
  },
  confirmIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.active.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  confirmTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  confirmReceptor: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
  },
  confirmTotal: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.brand.violet600,
    marginTop: spacing.sm,
  },
  confirmNote: {
    fontSize: typography.size.sm,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  errorBanner: {
    backgroundColor: colors.status.error.bg,
    borderRadius: radius.sm,
    padding: spacing.base,
    marginTop: spacing.md,
  },
  errorBannerText: {
    fontSize: typography.size.sm,
    color: colors.status.error.text,
    textAlign: 'center',
  },
  emitButton: {
    marginTop: spacing.xl,
  },
  retryButton: {
    marginTop: spacing.md,
  },

  // Navigation bar
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.lighter,
    backgroundColor: colors.bg.surface,
  },
});
