/**
 * Contacts List Screen — searchable list with FAB, pull-to-refresh, infinite scroll.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Screen, Header, Input, FAB, EmptyState, LoadingSpinner } from '@/components/ui';
import { ContactCard } from '@/components/contacts/ContactCard';
import { useContacts } from '@/hooks/use-contacts';
import type { Contact } from '@/lib/dte-types';
import { colors, spacing } from '@/theme';

export default function ContactsListScreen() {
  const [search, setSearch] = useState('');
  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
    isRefetching,
  } = useContacts(search || undefined);

  const contacts = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(({ item }: { item: Contact }) => (
    <ContactCard contact={item} />
  ), []);

  const keyExtractor = useCallback((item: Contact) => String(item.id), []);

  return (
    <Screen>
      <Header title="Contactos" showBack />

      <View style={styles.searchContainer}>
        <Input
          placeholder="Buscar por nombre o RUT..."
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <FlatList
          data={contacts}
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
          contentContainerStyle={contacts.length === 0 ? styles.emptyContainer : styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="Sin contactos"
              description="Agrega tu primer contacto para comenzar"
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? <LoadingSpinner size="small" /> : null
          }
        />
      )}

      <FAB onPress={() => router.push('/(stacks)/contacts/new' as never)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  listContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing['4xl'],
  },
  emptyContainer: {
    flex: 1,
  },
});
