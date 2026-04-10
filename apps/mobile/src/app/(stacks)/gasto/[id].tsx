/**
 * CUENTAX Mobile -- Expense Detail Screen
 * Full detail view with edit mode and delete confirmation.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Alert,
  Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, radius, shadows } from '@/theme';
import { Screen, Header, Card, Button, Badge, LoadingSpinner } from '@/components/ui';
import { GastoForm } from '@/components/gastos/GastoForm';
import {
  useGasto,
  useUpdateGasto,
  useDeleteGasto,
  type CreateGastoDTO,
} from '@/hooks/use-gastos';
import { formatCLP, formatDate } from '@/lib/formatters';
import { CATEGORIA_MAP, TIPO_DOC_LABELS } from '@/constants/gastos';

// ── Detail Row ─────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={14} color={colors.text.muted} style={styles.detailIcon} />
      <View style={styles.detailContent}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value ?? '-'}</Text>
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────

export default function GastoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { gasto, isLoading, error } = useGasto(id);
  const { updateGasto, isUpdating } = useUpdateGasto();
  const { deleteGasto, isDeleting } = useDeleteGasto();

  const [isEditing, setIsEditing] = useState(false);

  const handleUpdate = useCallback(
    async (data: CreateGastoDTO) => {
      if (!id) return;
      try {
        await updateGasto({ id, payload: data });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsEditing(false);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error actualizando gasto';
        Alert.alert('Error', message);
      }
    },
    [id, updateGasto],
  );

  const handleDelete = useCallback(() => {
    if (!id) return;
    Alert.alert(
      'Eliminar gasto',
      'Esta accion eliminara el gasto de forma permanente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGasto(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Error eliminando gasto';
              Alert.alert('Error', message);
            }
          },
        },
      ],
    );
  }, [id, deleteGasto]);

  // Loading state
  if (isLoading) {
    return (
      <Screen>
        <Header title="Gasto" showBack />
        <LoadingSpinner message="Cargando gasto..." fullScreen />
      </Screen>
    );
  }

  // Error state
  if (error || !gasto) {
    return (
      <Screen>
        <Header title="Gasto" showBack />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.status.error.text} />
          <Text style={styles.errorText}>
            {error ? 'Error cargando gasto' : 'Gasto no encontrado'}
          </Text>
          <Button title="Volver" onPress={() => router.back()} variant="secondary" />
        </View>
      </Screen>
    );
  }

  // Edit mode
  if (isEditing) {
    return (
      <Screen>
        <Header title="Editar Gasto" showBack />
        <GastoForm
          initialValues={{
            tipo_documento: gasto.tipo_documento,
            numero_documento: gasto.numero_documento,
            fecha_documento: gasto.fecha_documento?.slice(0, 10),
            emisor_rut: gasto.emisor_rut,
            emisor_razon_social: gasto.emisor_razon_social,
            monto_neto: gasto.monto_neto,
            monto_iva: gasto.monto_iva,
            monto_total: gasto.monto_total,
            categoria: gasto.categoria,
            descripcion: gasto.descripcion,
            foto_url: gasto.foto_url ?? undefined,
          }}
          fotoUri={gasto.foto_url}
          isSaving={isUpdating}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
          submitLabel="Guardar Cambios"
        />
      </Screen>
    );
  }

  // Detail view
  const cat = CATEGORIA_MAP[gasto.categoria];

  return (
    <Screen>
      <Header
        title={gasto.emisor_razon_social || 'Gasto'}
        subtitle={`${TIPO_DOC_LABELS[gasto.tipo_documento] ?? gasto.tipo_documento}${gasto.numero_documento ? ` #${gasto.numero_documento}` : ''} - ${formatDate(gasto.fecha_documento)}`}
        showBack
        rightAction={
          <View style={styles.headerActions}>
            <Pressable onPress={() => setIsEditing(true)} style={styles.headerButton}>
              <Ionicons name="create-outline" size={20} color={colors.brand.violet600} />
            </Pressable>
            <Pressable onPress={handleDelete} style={styles.headerButton}>
              <Ionicons name="trash-outline" size={20} color={colors.status.error.text} />
            </Pressable>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo */}
        {gasto.foto_url ? (
          <Card style={styles.photoCard}>
            <Image
              source={{ uri: gasto.foto_url }}
              style={styles.photo}
              resizeMode="contain"
            />
          </Card>
        ) : (
          <Card style={styles.noPhotoCard}>
            <Ionicons name="image-outline" size={40} color={colors.text.muted} />
            <Text style={styles.noPhotoText}>Sin foto del documento</Text>
          </Card>
        )}

        {/* Amount card */}
        <Card style={styles.amountCard}>
          <View style={styles.amountHeader}>
            <Text style={styles.amountLabel}>MONTO TOTAL</Text>
            {gasto.verificado ? (
              <Badge label="Verificado" variant="success" />
            ) : (
              <Badge label="Pendiente" variant="warning" />
            )}
          </View>
          <Text style={styles.amountValue}>{formatCLP(gasto.monto_total)}</Text>
          {(gasto.monto_neto > 0 || gasto.monto_iva > 0) && (
            <View style={styles.amountBreakdown}>
              <Text style={styles.breakdownText}>Neto: {formatCLP(gasto.monto_neto)}</Text>
              <Text style={styles.breakdownText}>IVA: {formatCLP(gasto.monto_iva)}</Text>
            </View>
          )}

          {/* OCR confidence bar */}
          {gasto.confianza_ocr !== null && gasto.confianza_ocr !== undefined && (
            <View style={styles.ocrSection}>
              <View style={styles.ocrRow}>
                <Text style={styles.ocrLabel}>Confianza OCR:</Text>
                <View style={styles.ocrBarBg}>
                  <View
                    style={[
                      styles.ocrBarFill,
                      {
                        width: `${Math.round(gasto.confianza_ocr * 100)}%`,
                        backgroundColor:
                          gasto.confianza_ocr >= 0.8
                            ? colors.status.ok.text
                            : gasto.confianza_ocr >= 0.5
                            ? colors.status.warn.text
                            : colors.status.error.text,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.ocrPercent}>
                  {Math.round(gasto.confianza_ocr * 100)}%
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Document info */}
        <Card style={styles.detailCard}>
          <Text style={styles.sectionTitle}>DOCUMENTO</Text>
          <DetailRow
            icon="document-text-outline"
            label="Tipo de Documento"
            value={TIPO_DOC_LABELS[gasto.tipo_documento] ?? gasto.tipo_documento}
          />
          <DetailRow icon="document-text-outline" label="Numero" value={gasto.numero_documento} />
          <DetailRow icon="calendar-outline" label="Fecha" value={formatDate(gasto.fecha_documento)} />
        </Card>

        {/* Emisor info */}
        <Card style={styles.detailCard}>
          <Text style={styles.sectionTitle}>EMISOR</Text>
          <DetailRow icon="business-outline" label="Razon Social" value={gasto.emisor_razon_social} />
          <DetailRow icon="business-outline" label="RUT" value={gasto.emisor_rut} />
        </Card>

        {/* Classification */}
        <Card style={styles.detailCard}>
          <Text style={styles.sectionTitle}>CLASIFICACION</Text>
          <DetailRow
            icon="pricetag-outline"
            label="Categoria"
            value={cat?.label ?? gasto.categoria}
          />
          {gasto.descripcion && (
            <DetailRow icon="chatbox-outline" label="Descripcion" value={gasto.descripcion} />
          )}
          <DetailRow icon="time-outline" label="Registrado" value={formatDate(gasto.created_at)} />
        </Card>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Button
            title="Editar"
            onPress={() => setIsEditing(true)}
            variant="secondary"
            icon={<Ionicons name="create-outline" size={16} color={colors.text.primary} />}
            style={styles.actionBtn}
          />
          <Button
            title="Eliminar"
            onPress={handleDelete}
            variant="danger"
            loading={isDeleting}
            icon={<Ionicons name="trash-outline" size={16} color={colors.status.error.text} />}
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerButton: {
    padding: spacing.xs,
  },
  photoCard: {
    overflow: 'hidden',
    padding: 0,
  },
  photo: {
    width: '100%',
    height: 220,
    backgroundColor: colors.bg.elevated,
  },
  noPhotoCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.sm,
  },
  noPhotoText: {
    fontSize: typography.size.sm,
    color: colors.text.muted,
  },
  amountCard: {
    gap: spacing.sm,
  },
  amountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: typography.weight.medium,
    color: colors.text.muted,
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  amountBreakdown: {
    flexDirection: 'row',
    gap: spacing.base,
  },
  breakdownText: {
    fontSize: typography.size.xs,
    color: colors.text.secondary,
  },
  ocrSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  ocrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ocrLabel: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
  ocrBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: colors.bg.elevated,
    borderRadius: 2,
    overflow: 'hidden',
  },
  ocrBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  ocrPercent: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    color: colors.text.muted,
    fontVariant: ['tabular-nums'],
  },
  detailCard: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: typography.weight.semibold,
    color: colors.text.muted,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  detailIcon: {
    marginTop: 2,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
  detailValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    fontSize: typography.size.base,
    color: colors.status.error.text,
    textAlign: 'center',
  },
});
