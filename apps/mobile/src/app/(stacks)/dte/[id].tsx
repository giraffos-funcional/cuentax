/**
 * DTE Detail Screen — full document info with SII status polling, PDF download, share.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Header, Card, Button, Badge, Divider, LoadingSpinner } from '@/components/ui';
import { StatusBadge } from '@/components/dte/StatusBadge';
import { useDTE, useDTEStatus, useDTEPDF } from '@/hooks/use-dte';
import { formatCLP, formatDate, formatRUT } from '@/lib/formatters';
import { sharePDF } from '@/lib/file-utils';
import { DTE_TYPE_LABELS } from '@/lib/dte-types';
import type { DTEStatus } from '@/lib/dte-types';
import { colors, spacing, typography, radius } from '@/theme';

export default function DTEDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dteId = Number(id);

  const { data: dte, isLoading } = useDTE(dteId);
  const { data: siiStatus, isLoading: isPolling } = useDTEStatus(dte?.track_id ?? undefined);
  const pdfMutation = useDTEPDF();
  const [pdfUri, setPdfUri] = useState<string | null>(null);

  const handleDownloadPDF = useCallback(async () => {
    if (!dte?.track_id) return;
    try {
      const uri = await pdfMutation.mutateAsync({
        trackId: dte.track_id,
        folio: dte.folio,
        tipoDte: dte.tipo_dte,
      });
      setPdfUri(uri);
      Alert.alert('PDF Descargado', 'PDF guardado correctamente', [
        { text: 'Compartir', onPress: () => sharePDF(uri) },
        { text: 'OK' },
      ]);
    } catch {
      Alert.alert('Error', 'No se pudo descargar el PDF');
    }
  }, [dte, pdfMutation]);

  const handleSharePDF = useCallback(async () => {
    if (pdfUri) {
      await sharePDF(pdfUri);
      return;
    }
    handleDownloadPDF();
  }, [pdfUri, handleDownloadPDF]);

  if (isLoading || !dte) {
    return (
      <Screen>
        <Header title="Detalle DTE" showBack />
        <LoadingSpinner />
      </Screen>
    );
  }

  const effectiveStatus = (siiStatus?.status as DTEStatus) ?? dte.status;
  const typeLabel = DTE_TYPE_LABELS[dte.tipo_dte] ?? `Tipo ${dte.tipo_dte}`;

  return (
    <Screen>
      <Header title={`${typeLabel} N.${dte.folio}`} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Status section */}
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <StatusBadge status={effectiveStatus} />
            {isPolling && dte.status !== 'aceptado' && dte.status !== 'rechazado' && (
              <View style={styles.pollingIndicator}>
                <Ionicons name="sync" size={14} color={colors.text.muted} />
                <Text style={styles.pollingText}>Consultando SII...</Text>
              </View>
            )}
          </View>
          {(effectiveStatus === 'rechazado' || effectiveStatus === 'error') && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                {siiStatus?.glosa ?? siiStatus?.detail ?? dte.sii_status_detail ?? 'Documento rechazado por el SII'}
              </Text>
            </View>
          )}
        </Card>

        {/* Document info */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Documento</Text>
          <InfoRow label="Tipo" value={typeLabel} />
          <InfoRow label="Folio" value={String(dte.folio)} />
          <InfoRow label="Fecha" value={formatDate(dte.fecha)} />
          {dte.track_id && <InfoRow label="Track ID" value={dte.track_id} />}
        </Card>

        {/* Receptor */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Receptor</Text>
          <InfoRow label="RUT" value={formatRUT(dte.rut_receptor)} />
          <InfoRow label="Razon Social" value={dte.razon_social_receptor} />
          {dte.giro_receptor && <InfoRow label="Giro" value={dte.giro_receptor} />}
          {dte.direccion_receptor && <InfoRow label="Direccion" value={dte.direccion_receptor} />}
          {dte.comuna_receptor && <InfoRow label="Comuna" value={dte.comuna_receptor} />}
        </Card>

        {/* Items */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle</Text>
          {dte.items?.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.nombre}</Text>
                {item.descripcion && (
                  <Text style={styles.itemDesc}>{item.descripcion}</Text>
                )}
                <Text style={styles.itemQty}>
                  {item.cantidad} x {formatCLP(item.precio_unitario)}
                  {(item.descuento_porcentaje ?? 0) > 0 ? ` (-${item.descuento_porcentaje}%)` : ''}
                </Text>
              </View>
              <Text style={styles.itemTotal}>
                {formatCLP(Math.round(
                  item.cantidad * item.precio_unitario * (1 - (item.descuento_porcentaje ?? 0) / 100)
                ))}
              </Text>
            </View>
          ))}
        </Card>

        {/* Totals */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Montos</Text>
          <InfoRow label="Neto" value={formatCLP(dte.monto_neto)} />
          {dte.monto_exento > 0 && <InfoRow label="Exento" value={formatCLP(dte.monto_exento)} />}
          <InfoRow label="IVA (19%)" value={formatCLP(dte.monto_iva)} />
          <Divider />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCLP(dte.monto_total)}</Text>
          </View>
        </Card>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Descargar PDF"
            variant="primary"
            size="lg"
            onPress={handleDownloadPDF}
            loading={pdfMutation.isPending}
            icon={<Ionicons name="download-outline" size={20} color={colors.text.inverse} />}
            style={styles.actionBtn}
          />
          {pdfUri && (
            <Button
              title="Compartir PDF"
              variant="outline"
              size="lg"
              onPress={handleSharePDF}
              icon={<Ionicons name="share-outline" size={20} color={colors.brand.violet600} />}
              style={styles.actionBtn}
            />
          )}
          {dte.track_id && (
            <Button
              title="Ver en SII"
              variant="ghost"
              size="md"
              onPress={() => {
                Linking.openURL(
                  `https://www.sii.cl/cgi_dte/consultadte.cgi?ESSION_ID=${dte.track_id}`
                );
              }}
              icon={<Ionicons name="open-outline" size={18} color={colors.brand.violet600} />}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  statusCard: {
    padding: spacing.base,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pollingText: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
  errorContainer: {
    marginTop: spacing.sm,
    backgroundColor: colors.status.error.bg,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.status.error.text,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    flex: 0.4,
  },
  infoValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
    flex: 0.6,
    textAlign: 'right',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
    gap: spacing.md,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  },
  itemDesc: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  itemQty: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  totalValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.brand.violet600,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  actionBtn: {
    width: '100%',
  },
});
