/**
 * CUENTAX Mobile -- useProcessOCR Hook
 * TanStack Query mutation for image OCR processing.
 */

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { compressImage, createFormData } from '@/lib/image-utils';

export interface OCRResult {
  tipo_documento?: string;
  numero_documento?: string;
  fecha_documento?: string;
  emisor_rut?: string;
  emisor_razon_social?: string;
  monto_neto?: number;
  monto_iva?: number;
  monto_total?: number;
  categoria?: string;
  descripcion?: string;
  confianza_ocr?: number;
  confianza_campos?: Record<string, number>;
  foto_url?: string;
}

export function useProcessOCR() {
  const mutation = useMutation({
    mutationFn: async (imageUri: string): Promise<OCRResult> => {
      // Compress the image before uploading
      const compressed = await compressImage(imageUri);
      const formData = createFormData(compressed.uri, 'image');

      const { data } = await apiClient.post('/api/v1/ocr/process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60_000,
      });

      // The BFF wraps in { success, data, meta }
      return data.data ?? data;
    },
  });

  return {
    processOCR: mutation.mutateAsync,
    isProcessing: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
