/**
 * CUENTAX Mobile — Root Layout
 * AppProviders (offline persistence, notifications, network), auth redirect.
 */

import React, { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { AppProviders } from '@/providers/AppProviders';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Not authenticated and not on auth screens — redirect to login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated but still on auth screens — redirect to dashboard
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProviders>
          <AuthGate>
            <Slot />
          </AuthGate>
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
