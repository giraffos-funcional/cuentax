/**
 * CUENTAX Mobile — Root Layout
 * AppProviders (offline persistence, notifications, network), auth redirect.
 */

import React, { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments, useNavigationContainerRef } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { AppProviders } from '@/providers/AppProviders';

function useProtectedRoute() {
  const { isAuthenticated } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const rootNavigation = useNavigationContainerRef();

  // Wait for navigation to be ready before attempting any navigation
  useEffect(() => {
    const unsubscribe = rootNavigation?.addListener?.('state', () => {
      setIsNavigationReady(true);
    });
    // Also set ready if already mounted
    if (rootNavigation?.isReady()) {
      setIsNavigationReady(true);
    }
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [rootNavigation]);

  useEffect(() => {
    if (!isNavigationReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isNavigationReady]);
}

export default function RootLayout() {
  useProtectedRoute();

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProviders>
          <Slot />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
