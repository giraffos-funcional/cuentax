/**
 * CUENTAX Mobile — Screen Component
 * SafeAreaView + StatusBar + ScrollView wrapper.
 */

import React, { type ReactNode } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
}

export function Screen({
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  style,
  contentContainerStyle,
  edges = ['top', 'left', 'right'],
}: ScreenProps) {
  return (
    <SafeAreaView style={[styles.safeArea, style]} edges={edges}>
      <StatusBar style="dark" />
      {scrollable ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.brand.violet600}
                colors={[colors.brand.violet600]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['2xl'],
  },
});
