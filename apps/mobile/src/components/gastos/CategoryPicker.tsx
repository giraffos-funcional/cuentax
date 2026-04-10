/**
 * CategoryPicker -- Grid of category options with icons and labels.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '@/theme';
import { CATEGORIAS, type CategoryDef } from '@/constants/gastos';

interface CategoryPickerProps {
  selected: string;
  onSelect: (value: string) => void;
}

function CategoryItem({
  item,
  isSelected,
  onSelect,
}: {
  item: CategoryDef;
  isSelected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.item, isSelected && styles.itemSelected]}
      onPress={() => onSelect(item.value)}
      activeOpacity={0.7}
      accessibilityLabel={item.label}
      accessibilityState={{ selected: isSelected }}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${item.color}15` }]}>
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>
      <Text
        style={[styles.label, isSelected && styles.labelSelected]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

export function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <FlatList
      data={CATEGORIAS}
      numColumns={4}
      keyExtractor={item => item.value}
      scrollEnabled={false}
      contentContainerStyle={styles.grid}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <CategoryItem
          item={item}
          isSelected={selected === item.value}
          onSelect={onSelect}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.surface,
    minWidth: 72,
  },
  itemSelected: {
    borderColor: colors.active.border,
    backgroundColor: colors.active.bg,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 10,
    fontWeight: typography.weight.medium,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  labelSelected: {
    color: colors.active.text,
    fontWeight: typography.weight.semibold,
  },
});
