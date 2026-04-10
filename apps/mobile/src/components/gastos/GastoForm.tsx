/**
 * GastoForm -- Reusable form for creating/editing expenses.
 * Fields: emisor, tipo_documento, montos, categoria, descripcion.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, radius, shadows } from '@/theme';
import { Card, Button, Input } from '@/components/ui';
import { CategoryPicker } from './CategoryPicker';
import { formatRUT, validateRUT, toISODate } from '@/lib/formatters';
import { TIPOS_DOCUMENTO, TIPO_DOC_LABELS } from '@/constants/gastos';
import type { CreateGastoDTO } from '@/hooks/use-gastos';

interface FormState {
  tipo_documento: string;
  numero_documento: string;
  fecha_documento: string;
  emisor_rut: string;
  emisor_razon_social: string;
  monto_neto: string;
  monto_iva: string;
  monto_total: string;
  categoria: string;
  descripcion: string;
}

interface GastoFormProps {
  initialValues?: Partial<CreateGastoDTO>;
  fotoUri?: string | null;
  isSaving: boolean;
  onSubmit: (data: CreateGastoDTO) => void;
  onCancel: () => void;
  submitLabel?: string;
}

export function GastoForm({
  initialValues,
  fotoUri,
  isSaving,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar Gasto',
}: GastoFormProps) {
  const [form, setForm] = useState<FormState>({
    tipo_documento: initialValues?.tipo_documento ?? 'boleta',
    numero_documento: initialValues?.numero_documento ?? '',
    fecha_documento: initialValues?.fecha_documento ?? toISODate(new Date()),
    emisor_rut: initialValues?.emisor_rut ?? '',
    emisor_razon_social: initialValues?.emisor_razon_social ?? '',
    monto_neto: initialValues?.monto_neto ? String(initialValues.monto_neto) : '',
    monto_iva: initialValues?.monto_iva ? String(initialValues.monto_iva) : '',
    monto_total: initialValues?.monto_total ? String(initialValues.monto_total) : '',
    categoria: initialValues?.categoria ?? 'otros',
    descripcion: initialValues?.descripcion ?? '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCategoria, setShowCategoria] = useState(false);
  const [showTipoDoc, setShowTipoDoc] = useState(false);

  const set = useCallback((field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleMontoNetoChange = useCallback((val: string) => {
    set('monto_neto', val);
    const neto = parseInt(val, 10) || 0;
    if (neto > 0) {
      const iva = Math.round(neto * 0.19);
      set('monto_iva', String(iva));
      set('monto_total', String(neto + iva));
    }
  }, [set]);

  const handleRutChange = useCallback((val: string) => {
    const cleaned = val.replace(/[^0-9kK\-\.]/g, '');
    set('emisor_rut', cleaned);
  }, [set]);

  const handleRutBlur = useCallback(() => {
    if (form.emisor_rut.trim()) {
      set('emisor_rut', formatRUT(form.emisor_rut));
    }
  }, [form.emisor_rut, set]);

  const rutRaw = form.emisor_rut.replace(/\./g, '').replace(/-/g, '');
  const rutInvalid = rutRaw.length >= 2 && !validateRUT(form.emisor_rut);

  const montoNeto = parseInt(form.monto_neto, 10) || 0;
  const montoIva = parseInt(form.monto_iva, 10) || 0;
  const montoTotal = parseInt(form.monto_total, 10) || 0;

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.monto_total.trim() || parseInt(form.monto_total, 10) <= 0) {
      newErrors.monto_total = 'El monto total es requerido';
    }
    if (!form.fecha_documento.trim()) {
      newErrors.fecha_documento = 'La fecha es requerida';
    }
    if (!form.categoria) {
      newErrors.categoria = 'Selecciona una categoria';
    }
    if (rutInvalid) {
      newErrors.emisor_rut = 'RUT invalido';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, rutInvalid]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const payload: CreateGastoDTO = {
      tipo_documento: form.tipo_documento,
      numero_documento: form.numero_documento || undefined,
      fecha_documento: form.fecha_documento,
      emisor_rut: form.emisor_rut || undefined,
      emisor_razon_social: form.emisor_razon_social || undefined,
      monto_neto: montoNeto || undefined,
      monto_iva: montoIva || undefined,
      monto_total: montoTotal,
      categoria: form.categoria,
      descripcion: form.descripcion || undefined,
      foto_url: initialValues?.foto_url ?? undefined,
    };

    onSubmit(payload);
  }, [form, montoNeto, montoIva, montoTotal, initialValues, validate, onSubmit]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo preview */}
        {fotoUri && (
          <Card style={styles.photoCard}>
            <Image source={{ uri: fotoUri }} style={styles.photo} resizeMode="cover" />
          </Card>
        )}

        {/* Tipo documento */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del Documento</Text>

          <View>
            <Text style={styles.fieldLabel}>Tipo de Documento</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowTipoDoc(!showTipoDoc)}
            >
              <Text style={styles.pickerText}>
                {TIPO_DOC_LABELS[form.tipo_documento] ?? form.tipo_documento}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.text.muted} />
            </TouchableOpacity>
            {showTipoDoc && (
              <View style={styles.pickerOptions}>
                {TIPOS_DOCUMENTO.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.pickerOption, form.tipo_documento === t.value && styles.pickerOptionSelected]}
                    onPress={() => { set('tipo_documento', t.value); setShowTipoDoc(false); }}
                  >
                    <Text style={[styles.pickerOptionText, form.tipo_documento === t.value && styles.pickerOptionTextSelected]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <Input
            label="Numero Documento"
            value={form.numero_documento}
            onChangeText={v => set('numero_documento', v)}
            placeholder="Ej: 12345"
          />

          <Input
            label="Fecha Documento *"
            value={form.fecha_documento}
            onChangeText={v => set('fecha_documento', v)}
            placeholder="YYYY-MM-DD"
            error={errors.fecha_documento}
          />
        </Card>

        {/* Emisor */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Emisor</Text>

          <Input
            label="RUT Emisor"
            value={form.emisor_rut}
            onChangeText={handleRutChange}
            onBlur={handleRutBlur}
            placeholder="12.345.678-9"
            error={errors.emisor_rut ?? (rutInvalid ? 'RUT invalido' : undefined)}
          />

          <Input
            label="Razon Social"
            value={form.emisor_razon_social}
            onChangeText={v => set('emisor_razon_social', v)}
            placeholder="Nombre del emisor"
          />
        </Card>

        {/* Montos */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Montos</Text>

          <Input
            label="Monto Neto"
            value={form.monto_neto}
            onChangeText={handleMontoNetoChange}
            placeholder="0"
            keyboardType="numeric"
          />

          <Input
            label="IVA (19%)"
            value={form.monto_iva}
            onChangeText={v => set('monto_iva', v)}
            placeholder="0"
            keyboardType="numeric"
          />

          <Input
            label="Monto Total *"
            value={form.monto_total}
            onChangeText={v => set('monto_total', v)}
            placeholder="0"
            keyboardType="numeric"
            error={errors.monto_total}
            style={{ fontWeight: typography.weight.bold }}
          />
        </Card>

        {/* Categoria */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Clasificacion</Text>

          <View>
            <Text style={styles.fieldLabel}>Categoria *</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowCategoria(!showCategoria)}
            >
              <Text style={styles.pickerText}>{form.categoria || 'Seleccionar'}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.text.muted} />
            </TouchableOpacity>
            {errors.categoria && <Text style={styles.errorText}>{errors.categoria}</Text>}
          </View>

          {showCategoria && (
            <CategoryPicker
              selected={form.categoria}
              onSelect={(cat) => { set('categoria', cat); setShowCategoria(false); }}
            />
          )}

          <Input
            label="Descripcion (opcional)"
            value={form.descripcion}
            onChangeText={v => set('descripcion', v)}
            placeholder="Detalle adicional del gasto..."
            multiline
            numberOfLines={2}
            style={{ minHeight: 60, textAlignVertical: 'top' }}
          />
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title={submitLabel}
            onPress={handleSubmit}
            loading={isSaving}
            variant="primary"
            style={{ width: '100%' }}
          />
          <Button
            title="Cancelar"
            onPress={onCancel}
            variant="ghost"
            disabled={isSaving}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  photoCard: {
    overflow: 'hidden',
    padding: 0,
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: radius.card,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  fieldLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.input,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  pickerText: {
    fontSize: typography.size.base,
    color: colors.text.primary,
  },
  pickerOptions: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.xs,
    ...shadows.md,
  },
  pickerOption: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
  },
  pickerOptionSelected: {
    backgroundColor: colors.active.bg,
  },
  pickerOptionText: {
    fontSize: typography.size.sm,
    color: colors.text.primary,
  },
  pickerOptionTextSelected: {
    color: colors.active.text,
    fontWeight: typography.weight.semibold,
  },
  errorText: {
    fontSize: typography.size.xs,
    color: colors.status.error.text,
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: 'center',
  },
});
