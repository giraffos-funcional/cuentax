/**
 * CUENTAX Mobile -- Scanner Tab Screen
 * Full camera preview for scanning boletas/facturas.
 * Flow: Camera -> Review -> OCR Processing -> Confirm & Save.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography } from '@/theme';
import { Screen, Header, LoadingSpinner } from '@/components/ui';
import { CameraViewComponent } from '@/components/scanner/CameraView';
import { ReviewImage } from '@/components/scanner/ReviewImage';
import { OCRResultsForm } from '@/components/scanner/OCRResultsForm';
import { useProcessOCR, type OCRResult } from '@/hooks/use-ocr';
import { useCreateGasto, type CreateGastoDTO } from '@/hooks/use-gastos';

type ScanStep = 'camera' | 'review' | 'processing' | 'confirm';

export default function ScanScreen() {
  const [step, setStep] = useState<ScanStep>('camera');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const { processOCR } = useProcessOCR();
  const { createGasto, isCreating } = useCreateGasto();

  // Step 1: Capture photo
  const handleCapture = useCallback((uri: string) => {
    setCapturedUri(uri);
    setStep('review');
  }, []);

  // Step 2: Process with OCR
  const handleProcess = useCallback(async () => {
    if (!capturedUri) return;

    setStep('processing');
    setOcrError(null);

    try {
      const result = await processOCR(capturedUri);
      setOcrResult(result);
      setStep('confirm');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error procesando imagen';
      setOcrError(message);
      setOcrResult(null);
      setStep('confirm');
    }
  }, [capturedUri, processOCR]);

  // Step 2b: Retake photo
  const handleRetake = useCallback(() => {
    setCapturedUri(null);
    setOcrResult(null);
    setOcrError(null);
    setStep('camera');
  }, []);

  // Step 3: Save gasto
  const handleSave = useCallback(async (data: CreateGastoDTO) => {
    try {
      await createGasto(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Gasto guardado', 'El gasto se registro correctamente.', [
        { text: 'Ver gastos', onPress: () => router.push('/(stacks)/gastos') },
        { text: 'Escanear otro', onPress: () => handleRetake() },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error guardando gasto';
      Alert.alert('Error', message);
    }
  }, [createGasto, handleRetake]);

  const handleCancel = useCallback(() => {
    handleRetake();
  }, [handleRetake]);

  // Camera step: full screen
  if (step === 'camera') {
    return <CameraViewComponent onCapture={handleCapture} />;
  }

  // Review step: captured image
  if (step === 'review') {
    return (
      <ReviewImage
        uri={capturedUri!}
        onRetake={handleRetake}
        onProcess={handleProcess}
        isProcessing={false}
      />
    );
  }

  // Processing step: loading animation
  if (step === 'processing') {
    return (
      <Screen>
        <View style={styles.processingContainer}>
          <LoadingSpinner size="large" />
          <Text style={styles.processingTitle}>Procesando documento...</Text>
          <Text style={styles.processingSubtitle}>
            Extrayendo datos con reconocimiento optico. Esto puede tomar unos segundos.
          </Text>
          <View style={styles.progressBar}>
            <View style={styles.progressFill} />
          </View>
        </View>
      </Screen>
    );
  }

  // Confirm step: OCR results form
  return (
    <Screen>
      <Header
        title="Confirmar Datos"
        subtitle="Revisa y confirma los datos del gasto"
        showBack
      />

      {ocrError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>
            {ocrError}. Puedes ingresar los datos manualmente.
          </Text>
        </View>
      )}

      <OCRResultsForm
        ocrResult={ocrResult}
        isSaving={isCreating}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    gap: spacing.md,
  },
  processingTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
  },
  processingSubtitle: {
    fontSize: typography.size.sm,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  progressBar: {
    width: '60%',
    height: 4,
    backgroundColor: colors.bg.elevated,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: {
    width: '66%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.brand.violet600,
  },
  errorBanner: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.status.warn.bg,
    borderWidth: 1,
    borderColor: colors.status.warn.border,
  },
  errorBannerText: {
    fontSize: typography.size.xs,
    color: colors.status.warn.text,
  },
});
