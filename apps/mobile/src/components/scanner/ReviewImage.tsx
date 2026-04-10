/**
 * ReviewImage -- Full-screen captured photo review.
 * User can retake or confirm for OCR processing.
 */

import React, { useState, useEffect } from 'react';
import { View, Image, Text, StyleSheet, Dimensions } from 'react-native';
import { colors, spacing, typography, radius, shadows } from '@/theme';
import { Button } from '@/components/ui';
import { getFileSize, formatFileSize } from '@/lib/image-utils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ReviewImageProps {
  uri: string;
  onRetake: () => void;
  onProcess: () => void;
  isProcessing: boolean;
}

export function ReviewImage({ uri, onRetake, onProcess, isProcessing }: ReviewImageProps) {
  const [imageInfo, setImageInfo] = useState<{ size: number; width: number; height: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadInfo() {
      const size = await getFileSize(uri);
      // Get image dimensions
      Image.getSize(
        uri,
        (w, h) => {
          if (mounted) setImageInfo({ size, width: w, height: h });
        },
        () => {
          if (mounted) setImageInfo({ size, width: 0, height: 0 });
        },
      );
    }

    loadInfo();
    return () => { mounted = false; };
  }, [uri]);

  return (
    <View style={styles.container}>
      {/* Image preview */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      {/* Image info */}
      {imageInfo && (
        <View style={styles.infoRow}>
          <Text style={styles.infoText}>
            {imageInfo.width > 0 ? `${imageInfo.width} x ${imageInfo.height}` : ''}
          </Text>
          <Text style={styles.infoText}>
            {imageInfo.size > 0 ? formatFileSize(imageInfo.size) : ''}
          </Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          title="Retomar"
          onPress={onRetake}
          variant="secondary"
          disabled={isProcessing}
          style={styles.actionButton}
        />
        <Button
          title="Procesar"
          onPress={onProcess}
          variant="primary"
          loading={isProcessing}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  infoText: {
    fontSize: typography.size.xs,
    color: 'rgba(255,255,255,0.6)',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
    backgroundColor: '#000',
  },
  actionButton: {
    flex: 1,
  },
});
