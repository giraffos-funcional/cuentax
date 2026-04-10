/**
 * Documents Tab — paginated DTE list with filter chips, pull-to-refresh, infinite scroll.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Screen, Header, Chip, EmptyState, LoadingSpinner } from '@/components/ui';
import { DTECard } from '@/components/dte/DTECard';
import { useDTEs } from '@/hooks/use-dte';
import type { DTE, DTEStatus } from '@/lib/dte-types';
import { colors, spacing } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView } from 'react-native';

type StatusFilter = '' | DTEStatus;
type TipoFilter = 0 | 33 | 39 | 61 | 56;

const STATUS_CHIPS: { label: string; value: StatusFilter }[] = [
  { label: 'Todos', value: '' },
  { label: 'Aceptados', value: 'aceptado' },
  { label: 'Pendientes', value: 'pendiente' },
  { label: 'Rechazados', value: 'rechazado' },
];

const TIPO_CHIPS: { label: string; value: TipoFilter }[] = [
  { label: 'Todos', value: 0 },
  { label: 'Factura', value: 33 },
  { label: 'Boleta', value: 39 },
  { label: 'NC', value: 61 },
  { label: 'ND', value: 56 },
];

export default function DocumentsScreen() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>(0);

  const filters = useMemo(() => ({
    status: statusFilter || undefined,
    tipo_dte: tipoFilter || undefined,
  }), [statusFilter, tipoFilter]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
    isRefetching,
  } = useDTEs(filters);

  const documents = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(({ item }: { item: DTE }) => (
    <DTECard dte={item} />
  ), []);

  const keyExtractor = useCallback((item: DTE) => String(item.id), []);

  return (
    <Screen>
      <Header
        title="Documentos"
        rightAction={
          <Pressable
            onPress={() => router.push('/(stacks)/emitir' as never)}
            style={styles.emitBtn}
            accessibilityRole="button"
            accessibilityLabel="Emitir DTE"
          >
            <Ionicons name="add-circle" size={28} color={colors.brand.violet600} />
          </Pressable>
        }
      />

      {/* Filter chips */}
      <View style={styles.filtersContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {STATUS_CHIPS.map((chip) => (
            <Chip
              key={chip.value}
              label={chip.label}
              selected={statusFilter === chip.value}
              onPress={() => setStatusFilter(chip.value)}
            />
          ))}
          <View style={styles.chipDivider} />
          {TIPO_CHIPS.map((chip) => (
            <Chip
              key={chip.value}
              label={chip.label}
              selected={tipoFilter === chip.value}
              onPress={() => setTipoFilter(chip.value)}
            />
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={documents}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.brand.violet600}
            />
          }
          contentContainerStyle={documents.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title="Sin documentos"
              description="Emite tu primer DTE para comenzar"
              actionLabel="Emitir DTE"
              onAction={() => router.push('/(stacks)/emitir' as never)}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? <LoadingSpinner size="small" /> : null
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emitBtn: {
    padding: spacing.xs,
  },
  filtersContainer: {
    paddingBottom: spacing.md,
  },
  chipsRow: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border.light,
    marginHorizontal: spacing.xs,
  },
  listContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing['4xl'],
  },
  emptyContainer: {
    flex: 1,
  },
});
