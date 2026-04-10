/**
 * CUENTAX Mobile -- New Expense Screen
 * Create expense manually or pre-fill from OCR data via route params.
 */

import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen, Header } from '@/components/ui';
import { GastoForm } from '@/components/gastos/GastoForm';
import { useCreateGasto, type CreateGastoDTO } from '@/hooks/use-gastos';

export default function NewGastoScreen() {
  const params = useLocalSearchParams<{
    tipo_documento?: string;
    numero_documento?: string;
    fecha_documento?: string;
    emisor_rut?: string;
    emisor_razon_social?: string;
    monto_neto?: string;
    monto_iva?: string;
    monto_total?: string;
    categoria?: string;
    descripcion?: string;
    foto_url?: string;
    confianza_ocr?: string;
  }>();

  const { createGasto, isCreating } = useCreateGasto();

  // Build initial values from route params (OCR pre-fill)
  const initialValues: Partial<CreateGastoDTO> = {
    tipo_documento: params.tipo_documento ?? undefined,
    numero_documento: params.numero_documento ?? undefined,
    fecha_documento: params.fecha_documento ?? undefined,
    emisor_rut: params.emisor_rut ?? undefined,
    emisor_razon_social: params.emisor_razon_social ?? undefined,
    monto_neto: params.monto_neto ? Number(params.monto_neto) : undefined,
    monto_iva: params.monto_iva ? Number(params.monto_iva) : undefined,
    monto_total: params.monto_total ? Number(params.monto_total) : undefined,
    categoria: params.categoria ?? undefined,
    descripcion: params.descripcion ?? undefined,
    foto_url: params.foto_url ?? undefined,
    confianza_ocr: params.confianza_ocr ? Number(params.confianza_ocr) : undefined,
  };

  const handleSubmit = useCallback(async (data: CreateGastoDTO) => {
    try {
      await createGasto(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error guardando gasto';
      Alert.alert('Error', message);
    }
  }, [createGasto]);

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  return (
    <Screen>
      <Header
        title="Nuevo Gasto"
        subtitle="Ingresa los datos del documento"
        showBack
      />
      <GastoForm
        initialValues={initialValues}
        fotoUri={params.foto_url ?? null}
        isSaving={isCreating}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        submitLabel="Crear Gasto"
      />
    </Screen>
  );
}
