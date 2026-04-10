/**
 * CUENTAX Mobile -- Image Utilities
 * Compress, resize, and prepare images for OCR upload.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Compress and resize an image for upload.
 * Defaults: maxWidth 1200px, JPEG quality 0.8
 */
export async function compressImage(
  uri: string,
  maxWidth = 1200,
  quality = 0.8,
): Promise<{ uri: string; width: number; height: number }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

/**
 * Create a FormData object from a local file URI for multipart upload.
 */
export function createFormData(
  uri: string,
  fieldName = 'image',
): FormData {
  const filename = uri.split('/').pop() ?? `image-${Date.now()}.jpg`;
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';

  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };

  const mimeType = mimeTypes[ext] ?? 'image/jpeg';

  const formData = new FormData();
  formData.append(fieldName, {
    uri,
    name: filename,
    type: mimeType,
  } as unknown as Blob);

  return formData;
}

/**
 * Get the file size in bytes from a local URI.
 */
export async function getFileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && 'size' in info) {
    return info.size ?? 0;
  }
  return 0;
}

/**
 * Format bytes to human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
