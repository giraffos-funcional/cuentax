/**
 * CUENTAX Mobile — Dashboard Screen
 * Full implementation: KPIs, quick actions, recent documents.
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { DTEStatusBadge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/auth.store';
import { useStats, useRecentDTEs, useGastosStats, type DTE } from '@/hooks/use-dashboard';
import { formatCLP, formatDate } from '@/lib/formatters';
import { DTE_TYPE_LABELS } from '@/constants';
import { colors, spacing, typography, radius, shadows } from '@/theme';

// ── Skeleton Loader ──────────────────────────────────────────
function Skeleton({ width, height }: { width: number | string; height: number }) {
  return (
    <View
      style={[
        styles.skeleton,
        {
          width: width as number,
          height,
        },
      ]}
    />
  );
}

// ── KPI Card ─────────────────────────────────────────────────
interface KPICardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  isLoading?: boolean;
}

function KPICard({ label, value, subValue, icon, iconColor, iconBg, isLoading }: KPICardProps) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiHeader}>
        <Text style={styles.kpiLabel} numberOfLines={1}>{label}</Text>
        <View style={[styles.kpiIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon as any} size={14} color={iconColor} />
        </View>
      </View>
      {isLoading ? (
        <View style={{ gap: 6 }}>
          <Skeleton width={100} height={24} />
          <Skeleton width={70} height={14} />
        </View>
      ) : (
        <>
          <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
          {subValue && <Text style={styles.kpiSubValue} numberOfLines={1}>{subValue}</Text>}
        </>
      )}
    </View>
  );
}

// ── Quick Action Card ────────────────────────────────────────
interface QuickActionProps {
  label: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  onPress: () => void;
}

function QuickAction({ label, icon, iconColor, iconBg, onPress }: QuickActionProps) {
  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.quickAction,
        pressed && styles.quickActionPressed,
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Document Row ─────────────────────────────────────────────
function DocumentRow({ doc }: { doc: DTE }) {
  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigation to document detail (future)
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.docRow,
        pressed && styles.docRowPressed,
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${DTE_TYPE_LABELS[doc.tipo_dte] ?? 'DTE'} numero ${doc.folio}`}
    >
      <View style={styles.docIcon}>
        <Ionicons name="document-text-outline" size={16} color={colors.text.muted} />
      </View>
      <View style={styles.docInfo}>
        <View style={styles.docTitleRow}>
          <Text style={styles.docTitle} numberOfLines={1}>
            {DTE_TYPE_LABELS[doc.tipo_dte] ?? `Tipo ${doc.tipo_dte}`} #{doc.folio}
          </Text>
          <DTEStatusBadge status={doc.estado} />
        </View>
        <Text style={styles.docSubtitle} numberOfLines={1}>
          {doc.razon_social_receptor}
        </Text>
      </View>
      <View style={styles.docRight}>
        <Text style={styles.docAmount}>{formatCLP(doc.monto_total)}</Text>
        <Text style={styles.docDate}>{formatDate(doc.fecha_emision)}</Text>
      </View>
    </Pressable>
  );
}

// ── Main Dashboard ───────────────────────────────────────────
export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useStats();
  const { documentos, isLoading: dtesLoading, refetch: refetchDTEs } = useRecentDTEs(5);
  const { gastosStats, isLoading: gastosLoading, refetch: refetchGastos } = useGastosStats();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchDTEs(), refetchGastos()]);
    setRefreshing(false);
  }, [refetchStats, refetchDTEs, refetchGastos]);

  // Computed KPI values
  const totalEmitidos = useMemo(() => {
    if (!stats) return 0;
    if (stats.total_emitidos) return stats.total_emitidos;
    if (stats.por_estado) {
      return Object.values(stats.por_estado).reduce((sum, v) => sum + (v.count ?? 0), 0);
    }
    return 0;
  }, [stats]);

  const totalAceptados = stats?.total_aceptados ?? stats?.por_estado?.aceptado?.count ?? 0;
  const ingresosMes = stats?.total_aceptados ?? stats?.por_estado?.aceptado?.total ?? 0;
  const gastosMes = gastosStats?.total_gastos ?? 0;
  const ivaCredito = gastosStats?.total_iva ?? 0;
  const ivaDebito = Math.round(ingresosMes - (ingresosMes / 1.19));
  const balanceIVA = ivaDebito - ivaCredito;

  const handleSwitchCompany = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // TODO: show company picker modal
  };

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={styles.screenContent}
    >
      {/* Company Header */}
      {user?.company_name && (
        <Pressable
          style={styles.companyHeader}
          onPress={handleSwitchCompany}
          accessibilityLabel={`Empresa: ${user.company_name}. Toca para cambiar.`}
        >
          <View style={styles.companyLogo}>
            <Ionicons name="business" size={18} color={colors.text.inverse} />
          </View>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName} numberOfLines={1}>
              {user.company_name}
            </Text>
            {user.company_rut &&
              String(user.company_rut) !== 'false' &&
              String(user.company_rut) !== 'False' && (
                <Text style={styles.companyRut}>{user.company_rut}</Text>
              )}
          </View>
          {(user.companies?.length ?? 0) > 1 && (
            <Ionicons name="swap-horizontal" size={20} color={colors.text.muted} />
          )}
        </Pressable>
      )}

      {/* KPI Cards — Horizontal Scroll */}
      <View>
        <Text style={styles.sectionLabel}>Resumen del Mes</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiScroll}
          decelerationRate="fast"
          snapToInterval={164}
        >
          <KPICard
            label="Ventas del Mes"
            value={formatCLP(ingresosMes)}
            subValue="IVA incluido"
            icon="trending-up"
            iconColor={colors.active.text}
            iconBg={colors.active.bg}
            isLoading={statsLoading}
          />
          <KPICard
            label="Gastos del Mes"
            value={formatCLP(gastosMes)}
            subValue={gastosStats?.cantidad ? `${gastosStats.cantidad} docs` : undefined}
            icon="cart-outline"
            iconColor={colors.status.warn.text}
            iconBg={colors.status.warn.bg}
            isLoading={gastosLoading}
          />
          <KPICard
            label="Balance IVA"
            value={formatCLP(Math.abs(balanceIVA))}
            subValue={
              balanceIVA > 0
                ? 'IVA a pagar'
                : balanceIVA < 0
                  ? 'IVA a favor'
                  : 'Equilibrado'
            }
            icon="receipt-outline"
            iconColor={balanceIVA <= 0 ? colors.status.ok.text : colors.status.error.text}
            iconBg={balanceIVA <= 0 ? colors.status.ok.bg : colors.status.error.bg}
            isLoading={statsLoading || gastosLoading}
          />
        </ScrollView>
      </View>

      {/* Quick Actions */}
      <View>
        <Text style={styles.sectionLabel}>Acciones Rapidas</Text>
        <View style={styles.quickActionsGrid}>
          <QuickAction
            label="Escanear Boleta"
            icon="camera"
            iconColor={colors.brand.violet600}
            iconBg={colors.active.bg}
            onPress={() => router.push('/(tabs)/scan')}
          />
          <QuickAction
            label="Emitir Factura"
            icon="document-text"
            iconColor={colors.status.ok.text}
            iconBg={colors.status.ok.bg}
            onPress={() => {
              // Navigate to emit screen (future)
            }}
          />
          <QuickAction
            label="Nuevo Gasto"
            icon="cart"
            iconColor={colors.status.warn.text}
            iconBg={colors.status.warn.bg}
            onPress={() => {
              // Navigate to new expense (future)
            }}
          />
        </View>
      </View>

      {/* Recent Documents */}
      <View>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Documentos Recientes</Text>
          <Pressable
            onPress={() => router.push('/(tabs)/documents')}
            accessibilityLabel="Ver todos los documentos"
            hitSlop={8}
          >
            <Text style={styles.seeAllLink}>Ver todos</Text>
          </Pressable>
        </View>

        <Card padded={false} style={styles.docCard}>
          {dtesLoading ? (
            <View style={styles.docLoadingContainer}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.docSkeletonRow}>
                  <Skeleton width={32} height={32} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="80%" height={16} />
                    <Skeleton width="50%" height={12} />
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Skeleton width={80} height={16} />
                    <Skeleton width={60} height={12} />
                  </View>
                </View>
              ))}
            </View>
          ) : documentos.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="document-text-outline" size={24} color={colors.text.muted} />
              </View>
              <Text style={styles.emptyTitle}>No hay documentos emitidos</Text>
              <Text style={styles.emptySubtitle}>Emite tu primer DTE para verlo aqui</Text>
            </View>
          ) : (
            documentos.map((doc, index) => (
              <React.Fragment key={doc.id ?? doc.folio}>
                <DocumentRow doc={doc} />
                {index < documentos.length - 1 && <View style={styles.docDivider} />}
              </React.Fragment>
            ))
          )}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: spacing.lg,
    paddingBottom: spacing['4xl'],
  },

  // Company Header
  companyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  companyLogo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brand.violet600,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  companyRut: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },

  // Section Labels
  sectionLabel: {
    fontSize: 10,
    fontWeight: typography.weight.semibold,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  seeAllLink: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    color: colors.active.text,
  },

  // KPI Cards
  kpiScroll: {
    gap: spacing.md,
    paddingRight: spacing.base,
  },
  kpiCard: {
    width: 152,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border.light,
    padding: spacing.base,
    ...shadows.sm,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  kpiLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
    marginRight: spacing.sm,
  },
  kpiIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: 2,
  },
  kpiSubValue: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },

  // Quick Actions
  quickActionsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickAction: {
    flex: 1,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border.light,
    padding: spacing.base,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.sm,
  },
  quickActionPressed: {
    opacity: 0.85,
    backgroundColor: colors.hover.bg,
    transform: [{ scale: 0.97 }],
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    textAlign: 'center',
  },

  // Documents
  docCard: {
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  docRowPressed: {
    backgroundColor: colors.hover.bg,
  },
  docIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  docTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  },
  docSubtitle: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
  docRight: {
    alignItems: 'flex-end',
  },
  docAmount: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  docDate: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
  },
  docDivider: {
    height: 1,
    backgroundColor: colors.border.lighter,
    marginLeft: spacing.base + 32 + spacing.md,
  },

  // Loading & Empty
  docLoadingContainer: {
    padding: spacing.base,
    gap: spacing.base,
  },
  docSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    textAlign: 'center',
  },

  // Skeleton
  skeleton: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 6,
  },
});
