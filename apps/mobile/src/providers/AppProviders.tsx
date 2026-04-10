/**
 * CUENTAX Mobile — AppProviders
 * Root provider wrapper integrating offline persistence, network status,
 * push notifications, and the offline banner UI.
 */

import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient } from '@/lib/query-client';
import {
  asyncStoragePersister,
  shouldDehydrateQuery,
} from '@/lib/offline-storage';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useNotificationListeners } from '@/hooks/use-notifications';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Inner component that uses hooks requiring the query context.
 * Renders children with the offline banner overlay.
 */
function AppShell({ children }: { children: ReactNode }) {
  const { isConnected, pendingMutations } = useNetworkStatus();

  // Initialize notification listeners
  useNotificationListeners();

  return (
    <View style={styles.container}>
      <OfflineBanner
        isConnected={isConnected}
        pendingMutations={pendingMutations}
      />
      {children}
    </View>
  );
}

/**
 * Top-level providers for the CuentaX mobile app.
 *
 * Usage in _layout.tsx:
 * ```tsx
 * import { AppProviders } from '@/providers/AppProviders';
 *
 * export default function RootLayout() {
 *   return (
 *     <AppProviders>
 *       <Slot />
 *     </AppProviders>
 *   );
 * }
 * ```
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        dehydrateOptions: {
          shouldDehydrateQuery,
        },
      }}
    >
      <AppShell>{children}</AppShell>
    </PersistQueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
