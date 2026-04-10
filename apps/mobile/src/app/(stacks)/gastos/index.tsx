/**
 * CUENTAX Mobile -- Gastos (Expenses) List Screen
 * KPI cards, search, filters, paginated FlatList.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius, shadows } from '@/theme';
import { Screen, Header, Card, Input, Chip, FAB, EmptyState, LoadingSpinner, Badge } from '@/components/ui';
import { GastoCard } from '@/components/gastos/GastoCard';
import { useGastos, useGastoStats, type Gasto } from '@/hooks/use-gastos';
import { formatCLP } from '@/lib/formatters';
import { CATEGORIAS, MONTH_NAMES } from '@/constants/gastos';

export default function GastosScreen() {
  const now = new Date();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState('');
  const [mes] = useState(String(now.getMonth() + 1));
  const [year] = useState(String(now.getFullYear()));

  const { gastos, total, pages, isLoading, isRefetching, refetch } = useGastos(page, {
    categoria: selectedCategoria || undefined,
    mes,
    year,
  });

  const { stats } = useGastoStats(mes, year);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return gastos;
    const q = search.toLowerCase().trim();
    return gastos.filter(
      (g) =>
        g.emisor_razon_social?.toLowerCase().includes(q) ||
        g.emisor_rut?.toLowerCase().includes(q) ||
        g.numero_documento?.toLowerCase().includes(q) ||
        g.descripcion?.toLowerCase().includes(q),
    );
  }, [gastos, search]);

  const handleGastoPress = useCallback((gasto: Gasto) => {
    router.push(`/(stacks)/gasto/${gasto.id}`);
  }, []);

  const handleCategoriaPress = useCallback((value: string) => {
    setSelectedCategoria(prev => (prev === value ? '' : value));
    setPage(1);
  }, []);

  const handleEndReached = useCallback(() => {
    if (page < pages && !isLoading) {
      setPage(prev => prev + 1);
    }
  }, [page, pages, isLoading]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    refetch();
  }, [refetch]);

  const handleFAB = useCallback(() => {
    router.push('/(stacks)/gasto/new');
  }, []);

  const monthLabel = `${MONTH_NAMES[parseInt(mes, 10) - 1]} ${year}`;

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {/* KPI Cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.kpiRow}
      >
        <Card style={styles.kpiCard}>
          <View style={styles.kpiIconRow}>
            <View style={styles.kpiIconContainer}>
              <Ionicons name="cash-outline" size={16} color={colors.active.icon} />
            </View>
            <Text style={styles.kpiLabel}>TOTAL GASTOS</Text>
          </View>
          <Text style={styles.kpiValue}>{formatCLP(stats?.total_gastos ?? 0)}</Text>
          <Text style={styles.kpiSub}>{monthLabel}</Text>
        </Card>

        <Card style={styles.kpiCard}>
          <View style={styles.kpiIconRow}>
            <View style={styles.kpiIconContainer}>
              <Ionicons name="receipt-outline" size={16} color={colors.active.icon} />
            </View>
            <Text style={styles.kpiLabel}>IVA CREDITO</Text>
          </View>
          <Text style={styles.kpiValue}>{formatCLP(stats?.total_iva ?? 0)}</Text>
          <Text style={styles.kpiSub}>Para declaracion mensual</Text>
        </Card>

        <Card style={styles.kpiCard}>
          <View style={styles.kpiIconRow}>
            <View style={styles.kpiIconContainer}>
              <Ionicons name="document-text-outline" size={16} color={colors.active.icon} />
            </View>
            <Text style={styles.kpiLabel}>DOCUMENTOS</Text>
          </View>
          <Text style={styles.kpiValue}>{stats?.total_documentos ?? total}</Text>
          <Text style={styles.kpiSub}>Registrados</Text>
        </Card>
      </ScrollView>

      {/* Search */}
      <Input
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar por emisor, RUT, numero..."
        containerStyle={styles.searchContainer}
      />

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label="Todas"
          selected={selectedCategoria === ''}
          onPress={() => handleCategoriaPress('')}
        />
        {CATEGORIAS.map((cat) => (
          <Chip
            key={cat.value}
            label={cat.label}
            selected={selectedCategoria === cat.value}
            onPress={() => handleCategoriaPress(cat.value)}
          />
        ))}
      </ScrollView>
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon="receipt-outline"
        title="No hay gastos este mes"
        description="Escanea tu primera boleta o factura para comenzar"
        actionLabel="Escanear Documento"
        onAction={() => router.push('/(tabs)/scan')}
      />
    );
  };

  return (
    <Screen>
      <Header
        title="Gastos"
        subtitle={isLoading ? 'Cargando...' : `${total} gastos registrados`}
        showBack
      />

      {isLoading && page === 1 ? (
        <LoadingSpinner message="Cargando gastos..." fullScreen />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <GastoCard gasto={item} onPress={handleGastoPress} />
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.brand.violet600}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
        />
      )}

      <FAB onPress={handleFAB} icon="add" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing['4xl'] + 56,
  },
  listHeader: {
    paddingBottom: spacing.md,
  },
  kpiRow: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  kpiCard: {
    width: 170,
    gap: spacing.sm,
  },
  kpiIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kpiIconContainer: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.active.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: typography.weight.medium,
    color: colors.text.muted,
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
  },
  kpiSub: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
  },
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  chipRow: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  separator: {
    height: spacing.sm,
    paddingHorizontal: spacing.base,
  },
});
