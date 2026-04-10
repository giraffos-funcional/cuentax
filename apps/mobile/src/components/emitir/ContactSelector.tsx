/**
 * Contact Selector — search input + results FlatList + "Nuevo Contacto" option.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input, Avatar } from '@/components/ui';
import { useContacts } from '@/hooks/use-contacts';
import { formatRUT } from '@/lib/formatters';
import type { Contact } from '@/lib/dte-types';
import { colors, spacing, typography, radius } from '@/theme';

interface ContactSelectorProps {
  onSelect: (contact: Contact) => void;
  onCreateNew: () => void;
  selectedContact?: Contact | null;
}

export function ContactSelector({ onSelect, onCreateNew, selectedContact }: ContactSelectorProps) {
  const [search, setSearch] = useState('');
  const { data, isLoading, fetchNextPage, hasNextPage } = useContacts(search || undefined);

  const contacts = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  if (selectedContact) {
    return (
      <Pressable style={styles.selectedCard} onPress={() => onSelect(undefined as unknown as Contact)}>
        <Avatar name={selectedContact.razon_social} size={44} />
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedName}>{selectedContact.razon_social}</Text>
          <Text style={styles.selectedRut}>{formatRUT(selectedContact.rut)}</Text>
          {selectedContact.giro && (
            <Text style={styles.selectedGiro} numberOfLines={1}>{selectedContact.giro}</Text>
          )}
        </View>
        <Ionicons name="close-circle" size={24} color={colors.text.muted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Input
        placeholder="Buscar por nombre o RUT..."
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      <Pressable style={styles.newContactRow} onPress={onCreateNew}>
        <Ionicons name="person-add" size={20} color={colors.brand.violet600} />
        <Text style={styles.newContactText}>Nuevo Contacto</Text>
      </Pressable>

      <FlatList
        data={contacts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => onSelect(item)}
          >
            <Avatar name={item.razon_social} size={36} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowName} numberOfLines={1}>{item.razon_social}</Text>
              <Text style={styles.rowRut}>{formatRUT(item.rut)}</Text>
            </View>
          </Pressable>
        )}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.empty}>
              {search ? 'Sin resultados' : 'Busca un contacto o crea uno nuevo'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    marginTop: spacing.sm,
    maxHeight: 300,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
    gap: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.hover.bg,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text.primary,
  },
  rowRut: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
  newContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
  },
  newContactText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.brand.violet600,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.active.bg,
    borderRadius: radius.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.active.border,
    gap: spacing.md,
  },
  selectedInfo: {
    flex: 1,
  },
  selectedName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  selectedRut: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
  selectedGiro: {
    fontSize: typography.size.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    color: colors.text.muted,
    fontSize: typography.size.sm,
    paddingVertical: spacing.xl,
  },
});
