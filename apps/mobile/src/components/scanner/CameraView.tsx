/**
 * CameraView -- Full camera preview with document framing guide.
 * Uses expo-camera CameraView API (SDK 52+).
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { CameraView as ExpoCameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '@/theme';
import { Button } from '@/components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FRAME_PADDING = 32;
const FRAME_WIDTH = SCREEN_WIDTH - FRAME_PADDING * 2;
const FRAME_HEIGHT = FRAME_WIDTH * 1.4;
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;

interface CameraViewProps {
  onCapture: (uri: string) => void;
}

export function CameraViewComponent({ onCapture }: CameraViewProps) {
  const cameraRef = useRef<ExpoCameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: Platform.OS === 'android',
      });
      if (photo?.uri) {
        onCapture(photo.uri);
      }
    } catch {
      // Camera capture failed — silently recover
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, onCapture]);

  const handlePickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      onCapture(result.assets[0].uri);
    }
  }, [onCapture]);

  const toggleFlash = useCallback(() => {
    setFlashEnabled(prev => !prev);
    Haptics.selectionAsync();
  }, []);

  // Permission not determined yet
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Cargando camara...</Text>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={48} color={colors.text.muted} />
        </View>
        <Text style={styles.permissionTitle}>Acceso a la camara</Text>
        <Text style={styles.permissionText}>
          CuentaX necesita acceso a la camara para escanear tus boletas y facturas.
        </Text>
        <Button
          title="Permitir Camara"
          onPress={requestPermission}
          variant="primary"
          style={{ marginTop: spacing.base }}
        />
        <TouchableOpacity onPress={handlePickFromGallery} style={styles.galleryFallback}>
          <Ionicons name="images-outline" size={16} color={colors.brand.violet600} />
          <Text style={styles.galleryFallbackText}>Subir desde galeria</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera Preview */}
      <ExpoCameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        flash={flashEnabled ? 'on' : 'off'}
      >
        {/* Dark overlay with cutout */}
        <View style={styles.overlay}>
          {/* Instruction text */}
          <View style={styles.instructionContainer}>
            <Text style={styles.instructionText}>Encuadra tu boleta o factura</Text>
          </View>

          {/* Frame guide with corner markers */}
          <View style={styles.frameContainer}>
            {/* Top-left corner */}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            {/* Top-right corner */}
            <View style={[styles.corner, styles.cornerTopRight]} />
            {/* Bottom-left corner */}
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            {/* Bottom-right corner */}
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
        </View>
      </ExpoCameraView>

      {/* Bottom controls */}
      <View style={styles.controls}>
        {/* Flash toggle */}
        <TouchableOpacity onPress={toggleFlash} style={styles.controlButton}>
          <Ionicons
            name={flashEnabled ? 'flash' : 'flash-off'}
            size={24}
            color={colors.text.inverse}
          />
        </TouchableOpacity>

        {/* Shutter button */}
        <TouchableOpacity
          onPress={handleCapture}
          disabled={isCapturing}
          style={styles.shutterButton}
          activeOpacity={0.7}
          accessibilityLabel="Capturar foto"
        >
          <View style={[styles.shutterInner, isCapturing && styles.shutterCapturing]} />
        </TouchableOpacity>

        {/* Gallery picker */}
        <TouchableOpacity onPress={handlePickFromGallery} style={styles.controlButton}>
          <Ionicons name="images-outline" size={24} color={colors.text.inverse} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionContainer: {
    position: 'absolute',
    top: spacing['3xl'],
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  instructionText: {
    color: colors.text.inverse,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  frameContainer: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: colors.brand.violet400,
    borderTopLeftRadius: 4,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: colors.brand.violet400,
    borderTopRightRadius: 4,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: colors.brand.violet400,
    borderBottomLeftRadius: 4,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: colors.brand.violet400,
    borderBottomRightRadius: 4,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: '#000',
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  shutterInner: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    backgroundColor: colors.brand.violet600,
  },
  shutterCapturing: {
    backgroundColor: colors.brand.violet400,
    transform: [{ scale: 0.9 }],
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    backgroundColor: colors.bg.base,
  },
  permissionIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  permissionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  permissionText: {
    fontSize: typography.size.sm,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  galleryFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  galleryFallbackText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.brand.violet600,
  },
});
