/**
 * OCRResultsForm -- Displays extracted OCR data as editable form fields.
 * Each field shows a confidence indicator. Allows saving as a gasto.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, shadows } from '@/theme';
import { Card, Button, Input } from '@/components/ui';
import { CategoryPicker } from '@/components/gastos/CategoryPicker';
import { formatRUT, validateRUT, toISODate } from '@/lib/formatters';
import { TIPOS_DOCUMENTO, TIPO_DOC_LABELS } from '@/constants/gastos';
import type { OCRResult } from '@/hooks/use-ocr';
import type { CreateGastoDTO } from '@/hooks/use-gastos';

// ── Confidence indicator ───────────────────────────────────

function ConfidenceDot({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  const color = value >= 0.8 ? '#10b981' : value >= 0.5 ? '#f59e0b' : '#ef4444';
  const label = value >= 0.8 ? 'Alta' : value >= 0.5 ? 'Media' : 'Baja';
  return (
    <View style={styles.confidenceContainer}>
      <View style={[styles.confidenceDot, { backgroundColor: color }]} />
      <Text style={[styles.confidenceText, { color }]}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

// ── Form state ─────────────────────────────────────────────

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

interface OCRResultsFormProps {
  ocrResult: OCRResult | null;
  fotoUrl?: string;
  isSaving: boolean;
  onSave: (data: CreateGastoDTO) => void;
  onCancel: () => void;
}

export function OCRResultsForm({
  ocrResult,
  fotoUrl,
  isSaving,
  onSave,
  onCancel,
}: OCRResultsFormProps) {
  const [form, setForm] = useState<FormState>(() => ({
    tipo_documento: ocrResult?.tipo_documento ?? 'boleta',
    numero_documento: ocrResult?.numero_documento ?? '',
    fecha_documento: ocrResult?.fecha_documento ?? toISODate(new Date()),
    emisor_rut: ocrResult?.emisor_rut ?? '',
    emisor_razon_social: ocrResult?.emisor_razon_social ?? '',
    monto_neto: ocrResult?.monto_neto ? String(ocrResult.monto_neto) : '',
    monto_iva: ocrResult?.monto_iva ? String(ocrResult.monto_iva) : '',
    monto_total: ocrResult?.monto_total ? String(ocrResult.monto_total) : '',
    categoria: ocrResult?.categoria ?? 'otros',
    descripcion: ocrResult?.descripcion ?? '',
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCategoria, setShowCategoria] = useState(false);
  const [showTipoDoc, setShowTipoDoc] = useState(false);

  const confianza = ocrResult?.confianza_campos ?? {};
  const confianzaOCR = ocrResult?.confianza_ocr;

  const set = useCallback((field: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // Auto-calculate IVA and total from neto
  const handleMontoNetoChange = useCallback((val: string) => {
    set('monto_neto', val);
    const neto = parseInt(val, 10) || 0;
    if (neto > 0) {
      const iva = Math.round(neto * 0.19);
      set('monto_iva', String(iva));
      set('monto_total', String(neto + iva));
    }
  }, [set]);

  // RUT auto-format
  const handleRutChange = useCallback((val: string) => {
    const cleaned = val.replace(/[^0-9kK\-.]/g, '');
    set('emisor_rut', cleaned);
  }, [set]);

  const handleRutBlur = useCallback(() => {
    if (form.emisor_rut.trim()) {
      set('emisor_rut', formatRUT(form.emisor_rut));
    }
  }, [form.emisor_rut, set]);

  // Monto mismatch check
  const montoNeto = parseInt(form.monto_neto, 10) || 0;
  const montoIva = parseInt(form.monto_iva, 10) || 0;
  const montoTotal = parseInt(form.monto_total, 10) || 0;
  const montoMismatch = montoNeto > 0 && montoIva > 0 && montoTotal > 0
    && Math.abs((montoNeto + montoIva) - montoTotal) > 1;

  // RUT validation
  const rutRaw = form.emisor_rut.replace(/\./g, '').replace(/-/g, '');
  const rutInvalid = rutRaw.length >= 2 && !validateRUT(form.emisor_rut);

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

  const handleSave = useCallback(() => {
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
      foto_url: fotoUrl ?? ocrResult?.foto_url ?? undefined,
      confianza_ocr: confianzaOCR ?? undefined,
    };

    onSave(payload);
  }, [form, montoNeto, montoIva, montoTotal, fotoUrl, ocrResult, confianzaOCR, validate, onSave]);

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
        {/* OCR confidence banner */}
        {confianzaOCR !== undefined && (
          <View style={[
            styles.confidenceBanner,
            confianzaOCR >= 0.8 ? styles.bannerSuccess :
            confianzaOCR >= 0.5 ? styles.bannerWarning : styles.bannerError,
          ]}>
            <Ionicons
              name={confianzaOCR >= 0.8 ? 'checkmark-circle' : 'warning'}
              size={16}
              color={confianzaOCR >= 0.8 ? colors.status.ok.text :
                     confianzaOCR >= 0.5 ? colors.status.warn.text : colors.status.error.text}
            />
            <Text style={[
              styles.bannerText,
              { color: confianzaOCR >= 0.8 ? colors.status.ok.text :
                       confianzaOCR >= 0.5 ? colors.status.warn.text : colors.status.error.text },
            ]}>
              OCR: {Math.round(confianzaOCR * 100)}% de confianza. Revisa los datos.
            </Text>
          </View>
        )}

        {/* Document data */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del Documento</Text>

          {/* Tipo documento */}
          <View>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Tipo de Documento</Text>
              <ConfidenceDot value={confianza.tipo_documento} />
            </View>
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
                    style={[
                      styles.pickerOption,
                      form.tipo_documento === t.value && styles.pickerOptionSelected,
                    ]}
                    onPress={() => {
                      set('tipo_documento', t.value);
                      setShowTipoDoc(false);
                    }}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      form.tipo_documento === t.value && styles.pickerOptionTextSelected,
                    ]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Numero */}
          <View style={styles.fieldRow}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Numero Documento</Text>
              <ConfidenceDot value={confianza.numero_documento} />
            </View>
            <Input
              value={form.numero_documento}
              onChangeText={v => set('numero_documento', v)}
              placeholder="Ej: 12345"
              keyboardType="default"
            />
          </View>

          {/* Fecha */}
          <View style={styles.fieldRow}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Fecha Documento *</Text>
              <ConfidenceDot value={confianza.fecha_documento} />
            </View>
            <Input
              value={form.fecha_documento}
              onChangeText={v => set('fecha_documento', v)}
              placeholder="YYYY-MM-DD"
              error={errors.fecha_documento}
            />
          </View>
        </Card>

        {/* Emisor */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Emisor</Text>

          <View style={styles.fieldRow}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>RUT Emisor</Text>
              <ConfidenceDot value={confianza.emisor_rut} />
            </View>
            <Input
              value={form.emisor_rut}
              onChangeText={handleRutChange}
              onBlur={handleRutBlur}
              placeholder="12.345.678-9"
              keyboardType="default"
              error={errors.emisor_rut ?? (rutInvalid ? 'RUT invalido' : undefined)}
            />
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Razon Social</Text>
              <ConfidenceDot value={confianza.emisor_razon_social} />
            </View>
            <Input
              value={form.emisor_razon_social}
              onChangeText={v => set('emisor_razon_social', v)}
              placeholder="Nombre del emisor"
            />
          </View>
        </Card>

        {/* Montos */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Montos</Text>

          <View style={styles.fieldRow}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Monto Neto</Text>
              <ConfidenceDot value={confianza.monto_neto} />
            </View>
            <Input
              value={form.monto_neto}
              onChangeText={handleMontoNetoChange}
              placeholder="0"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>IVA</Text>
              <ConfidenceDot value={confianza.monto_iva} />
            </View>
            <Input
              value={form.monto_iva}
              onChangeText={v => set('monto_iva', v)}
              placeholder="0"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Monto Total *</Text>
              <ConfidenceDot value={confianza.monto_total} />
            </View>
            <Input
              value={form.monto_total}
              onChangeText={v => set('monto_total', v)}
              placeholder="0"
              keyboardType="numeric"
              error={errors.monto_total}
              style={{ fontWeight: typography.weight.bold }}
            />
          </View>

          {montoMismatch && (
            <View style={styles.mismatchBanner}>
              <Ionicons name="warning" size={14} color={colors.status.warn.text} />
              <Text style={styles.mismatchText}>
                Neto + IVA = ${montoNeto + montoIva}, pero el total es ${montoTotal}
              </Text>
            </View>
          )}
        </Card>

        {/* Categoria */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Clasificacion</Text>

          <View style={styles.fieldRow}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Categoria *</Text>
              <ConfidenceDot value={confianza.categoria} />
            </View>
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
              onSelect={(cat) => {
                set('categoria', cat);
                setShowCategoria(false);
              }}
            />
          )}

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Descripcion (opcional)</Text>
            <Input
              value={form.descripcion}
              onChangeText={v => set('descripcion', v)}
              placeholder="Detalle adicional del gasto..."
              multiline
              numberOfLines={2}
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
          </View>
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Guardar Gasto"
            onPress={handleSave}
            loading={isSaving}
            variant="primary"
            style={styles.saveButton}
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
  confidenceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: colors.status.ok.bg,
    borderColor: colors.status.ok.border,
  },
  bannerWarning: {
    backgroundColor: colors.status.warn.bg,
    borderColor: colors.status.warn.border,
  },
  bannerError: {
    backgroundColor: colors.status.error.bg,
    borderColor: colors.status.error.border,
  },
  bannerText: {
    flex: 1,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  fieldRow: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    color: colors.text.secondary,
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: typography.weight.medium,
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
    fontSize: typography.size.sm,
    color: colors.text.primary,
  },
  pickerOptions: {
    backgroundColor: colors.bg.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    overflow: 'hidden',
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
  mismatchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.status.warn.bg,
    borderWidth: 1,
    borderColor: colors.status.warn.border,
  },
  mismatchText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.status.warn.text,
  },
  errorText: {
    fontSize: typography.size.xs,
    color: colors.status.error.text,
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  saveButton: {
    width: '100%',
  },
});
