/**
 * CUENTAX Mobile — OfflineBanner
 * Fixed amber banner at top of screen when the device is offline.
 */

import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@/theme';

interface OfflineBannerProps {
  isConnected: boolean;
  pendingMutations: number;
}

export const OfflineBanner = memo<OfflineBannerProps>(
  ({ isConnected, pendingMutations }) => {
    const translateY = useRef(new Animated.Value(-80)).current;

    useEffect(() => {
      Animated.spring(translateY, {
        toValue: isConnected ? -80 : 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    }, [isConnected, translateY]);

    return (
      <Animated.View
        style={[styles.container, { transform: [{ translateY }] }]}
        pointerEvents={isConnected ? 'none' : 'auto'}
      >
        <View style={styles.content}>
          <Ionicons
            name="cloud-offline-outline"
            size={18}
            color={colors.status.warn.text}
          />
          <View style={styles.textContainer}>
            <Text style={styles.message}>
              Sin conexión — Los datos pueden no estar actualizados
            </Text>
            {pendingMutations > 0 && (
              <Text style={styles.pending}>
                {pendingMutations} cambio{pendingMutations === 1 ? '' : 's'} pendiente{pendingMutations === 1 ? '' : 's'}
              </Text>
            )}
          </View>
        </View>
      </Animated.View>
    );
  },
);

OfflineBanner.displayName = 'OfflineBanner';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: colors.status.warn.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.status.warn.border,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  message: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.status.warn.text,
  },
  pending: {
    fontSize: typography.size.xs,
    color: colors.status.warn.text,
    marginTop: 2,
    opacity: 0.8,
  },
});
