/**
 * Line Item Editor — expandable form with product search for DTE emission.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input, Card, Button } from '@/components/ui';
import { useProducts } from '@/hooks/use-products';
import { formatCLP } from '@/lib/formatters';
import type { DTEItem, Product } from '@/lib/dte-types';
import { colors, spacing, typography, radius } from '@/theme';

interface LineItemEditorProps {
  items: DTEItem[];
  onItemsChange: (items: DTEItem[]) => void;
}

const EMPTY_ITEM: DTEItem = {
  nombre: '',
  descripcion: '',
  cantidad: 1,
  precio_unitario: 0,
  descuento_porcentaje: 0,
  exento: false,
};

export function LineItemEditor({ items, onItemsChange }: LineItemEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(items.length === 0 ? 0 : null);
  const [draft, setDraft] = useState<DTEItem>({ ...EMPTY_ITEM });
  const [productSearch, setProductSearch] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);

  const { data: productData } = useProducts(productSearch || undefined);
  const products = useMemo(
    () => productData?.pages.flatMap((p) => p.data) ?? [],
    [productData],
  );

  const handleAddItem = useCallback(() => {
    setDraft({ ...EMPTY_ITEM });
    setEditingIndex(items.length);
    setShowProductSearch(true);
  }, [items.length]);

  const handleSaveItem = useCallback(() => {
    if (!draft.nombre.trim()) {
      Alert.alert('Error', 'Ingresa un nombre para el item');
      return;
    }
    if (draft.precio_unitario <= 0) {
      Alert.alert('Error', 'El precio debe ser mayor a 0');
      return;
    }

    const updated = [...items];
    if (editingIndex !== null && editingIndex < items.length) {
      updated[editingIndex] = { ...draft };
    } else {
      updated.push({ ...draft });
    }
    onItemsChange(updated);
    setEditingIndex(null);
    setShowProductSearch(false);
    setProductSearch('');
  }, [draft, items, editingIndex, onItemsChange]);

  const handleRemoveItem = useCallback((index: number) => {
    Alert.alert('Eliminar', 'Eliminar esta linea?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          const updated = items.filter((_, i) => i !== index);
          onItemsChange(updated);
        },
      },
    ]);
  }, [items, onItemsChange]);

  const handleSelectProduct = useCallback((product: Product) => {
    setDraft({
      nombre: product.nombre,
      descripcion: product.descripcion ?? '',
      cantidad: 1,
      precio_unitario: product.precio,
      descuento_porcentaje: 0,
      exento: product.exento,
    });
    setShowProductSearch(false);
    setProductSearch('');
  }, []);

  const handleEditItem = useCallback((index: number) => {
    setDraft({ ...items[index] });
    setEditingIndex(index);
    setShowProductSearch(false);
  }, [items]);

  const lineTotal = (item: DTEItem): number => {
    const subtotal = item.cantidad * item.precio_unitario;
    const discount = (item.descuento_porcentaje ?? 0) / 100;
    return Math.round(subtotal * (1 - discount));
  };

  return (
    <View style={styles.container}>
      {/* Existing items */}
      {items.map((item, index) => (
        <Card key={index} style={styles.itemCard}>
          <Pressable
            style={styles.itemRow}
            onPress={() => handleEditItem(index)}
          >
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>{item.nombre}</Text>
              <Text style={styles.itemDetail}>
                {item.cantidad} x {formatCLP(item.precio_unitario)}
                {(item.descuento_porcentaje ?? 0) > 0 ? ` (-${item.descuento_porcentaje}%)` : ''}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatCLP(lineTotal(item))}</Text>
            <Pressable
              onPress={() => handleRemoveItem(index)}
              hitSlop={8}
              style={styles.removeBtn}
            >
              <Ionicons name="trash-outline" size={18} color={colors.status.error.text} />
            </Pressable>
          </Pressable>

          {/* Inline edit form */}
          {editingIndex === index && (
            <View style={styles.editForm}>
              <Input
                label="Nombre"
                value={draft.nombre}
                onChangeText={(t) => setDraft((d) => ({ ...d, nombre: t }))}
              />
              <Input
                label="Descripcion"
                value={draft.descripcion ?? ''}
                onChangeText={(t) => setDraft((d) => ({ ...d, descripcion: t }))}
                containerStyle={styles.fieldGap}
              />
              <View style={styles.row}>
                <Input
                  label="Cantidad"
                  value={String(draft.cantidad)}
                  onChangeText={(t) => setDraft((d) => ({ ...d, cantidad: Number(t) || 0 }))}
                  keyboardType="numeric"
                  containerStyle={styles.halfField}
                />
                <Input
                  label="Precio Unitario"
                  value={String(draft.precio_unitario)}
                  onChangeText={(t) => setDraft((d) => ({ ...d, precio_unitario: Number(t) || 0 }))}
                  keyboardType="numeric"
                  containerStyle={styles.halfField}
                />
              </View>
              <Input
                label="Descuento %"
                value={String(draft.descuento_porcentaje ?? 0)}
                onChangeText={(t) => setDraft((d) => ({ ...d, descuento_porcentaje: Number(t) || 0 }))}
                keyboardType="numeric"
                containerStyle={styles.fieldGap}
              />
              <View style={styles.editActions}>
                <Button title="Cancelar" variant="ghost" size="sm" onPress={() => setEditingIndex(null)} />
                <Button title="Guardar" variant="primary" size="sm" onPress={handleSaveItem} />
              </View>
            </View>
          )}
        </Card>
      ))}

      {/* New item form */}
      {editingIndex !== null && editingIndex >= items.length && (
        <Card style={styles.newItemCard}>
          {showProductSearch && (
            <View style={styles.productSearchSection}>
              <Input
                placeholder="Buscar producto..."
                value={productSearch}
                onChangeText={setProductSearch}
              />
              {products.length > 0 && (
                <FlatList
                  data={products.slice(0, 5)}
                  keyExtractor={(p) => String(p.id)}
                  renderItem={({ item: product }) => (
                    <Pressable
                      style={({ pressed }) => [styles.productRow, pressed && styles.productRowPressed]}
                      onPress={() => handleSelectProduct(product)}
                    >
                      <Text style={styles.productName}>{product.nombre}</Text>
                      <Text style={styles.productPrice}>{formatCLP(product.precio)}</Text>
                    </Pressable>
                  )}
                  keyboardShouldPersistTaps="handled"
                  style={styles.productList}
                />
              )}
              <Pressable
                style={styles.manualEntry}
                onPress={() => setShowProductSearch(false)}
              >
                <Ionicons name="create-outline" size={16} color={colors.brand.violet600} />
                <Text style={styles.manualEntryText}>Ingresar manualmente</Text>
              </Pressable>
            </View>
          )}

          {!showProductSearch && (
            <View style={styles.editForm}>
              <Input
                label="Nombre"
                value={draft.nombre}
                onChangeText={(t) => setDraft((d) => ({ ...d, nombre: t }))}
                placeholder="Nombre del producto o servicio"
              />
              <Input
                label="Descripcion"
                value={draft.descripcion ?? ''}
                onChangeText={(t) => setDraft((d) => ({ ...d, descripcion: t }))}
                containerStyle={styles.fieldGap}
              />
              <View style={styles.row}>
                <Input
                  label="Cantidad"
                  value={String(draft.cantidad)}
                  onChangeText={(t) => setDraft((d) => ({ ...d, cantidad: Number(t) || 0 }))}
                  keyboardType="numeric"
                  containerStyle={styles.halfField}
                />
                <Input
                  label="Precio Unitario"
                  value={String(draft.precio_unitario)}
                  onChangeText={(t) => setDraft((d) => ({ ...d, precio_unitario: Number(t) || 0 }))}
                  keyboardType="numeric"
                  containerStyle={styles.halfField}
                />
              </View>
              <Input
                label="Descuento %"
                value={String(draft.descuento_porcentaje ?? 0)}
                onChangeText={(t) => setDraft((d) => ({ ...d, descuento_porcentaje: Number(t) || 0 }))}
                keyboardType="numeric"
                containerStyle={styles.fieldGap}
              />
              <View style={styles.editActions}>
                <Button
                  title="Cancelar"
                  variant="ghost"
                  size="sm"
                  onPress={() => { setEditingIndex(null); setShowProductSearch(false); }}
                />
                <Button title="Agregar" variant="primary" size="sm" onPress={handleSaveItem} />
              </View>
            </View>
          )}
        </Card>
      )}

      {/* Add button */}
      {editingIndex === null && (
        <Button
          title="Agregar Linea"
          variant="outline"
          onPress={handleAddItem}
          icon={<Ionicons name="add" size={20} color={colors.brand.violet600} />}
          style={styles.addButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  itemCard: {
    padding: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  itemDetail: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  removeBtn: {
    padding: spacing.xs,
  },
  newItemCard: {
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.active.border,
    borderStyle: 'dashed',
  },
  editForm: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  fieldGap: {
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  halfField: {
    flex: 1,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  productSearchSection: {
    gap: spacing.sm,
  },
  productList: {
    maxHeight: 180,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.lighter,
  },
  productRowPressed: {
    backgroundColor: colors.hover.bg,
  },
  productName: {
    fontSize: typography.size.base,
    color: colors.text.primary,
    flex: 1,
  },
  productPrice: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text.secondary,
  },
  manualEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  manualEntryText: {
    fontSize: typography.size.sm,
    color: colors.brand.violet600,
    fontWeight: typography.weight.medium,
  },
  addButton: {
    alignSelf: 'center',
  },
});
