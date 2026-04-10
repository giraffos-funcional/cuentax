/**
 * CUENTAX Mobile — File Utilities
 * PDF download, share, and open via expo-file-system and expo-sharing.
 */

import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

/** Download a PDF from the BFF and return the local temp URI */
export async function downloadPDF(url: string, filename?: string): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  const name = filename ?? `dte-${Date.now()}.pdf`;
  const localUri = `${cacheDirectory}${name}`;

  const downloadResult = await downloadAsync(
    `${apiClient.defaults.baseURL}${url}`,
    localUri,
    {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        Accept: 'application/pdf',
      },
    },
  );

  if (downloadResult.status !== 200) {
    throw new Error(`Error descargando PDF: status ${downloadResult.status}`);
  }

  return downloadResult.uri;
}

/** Open the native share sheet for a local file URI */
export async function sharePDF(localUri: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Compartir no disponible en este dispositivo');
  }
  await Sharing.shareAsync(localUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Compartir DTE',
    UTI: 'com.adobe.pdf',
  });
}

/** Download and immediately share a PDF */
export async function downloadAndSharePDF(url: string, filename?: string): Promise<void> {
  const localUri = await downloadPDF(url, filename);
  await sharePDF(localUri);
}
