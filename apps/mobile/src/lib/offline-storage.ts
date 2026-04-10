/**
 * CUENTAX Mobile — Offline Storage
 * TanStack Query persistence with AsyncStorage for offline data access.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

/**
 * AsyncStorage-backed persister for TanStack Query.
 * Keeps query cache across app restarts for offline viewing.
 */
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'cuentax-query-cache',
  // Serialize/deserialize with default JSON — no custom needed
  throttleTime: 1000, // Batch writes every 1s to avoid thrashing
});

/**
 * Stale time configuration per query key prefix.
 * Used in individual hooks or as default query options.
 */
export const STALE_TIMES = {
  /** Dashboard stats, recent DTEs, gastos */
  realtime: 5 * 60 * 1000, // 5 minutes
  /** Contact and product lists — change less frequently */
  lists: 30 * 60 * 1000, // 30 minutes
  /** User profile, company settings */
  static: 60 * 60 * 1000, // 1 hour
} as const;

/**
 * Garbage collection time — how long to keep stale data in cache.
 * 24 hours ensures offline users can view yesterday's data.
 */
export const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Determines whether a query should be persisted.
 * Mutations and one-time queries should not be persisted.
 */
export function shouldDehydrateQuery(query: { queryKey: readonly unknown[] }): boolean {
  const key = query.queryKey[0];
  if (typeof key !== 'string') return true;

  // Skip volatile or auth-related queries
  const skipPrefixes = ['auth', 'push-token', 'ai-chat'];
  return !skipPrefixes.some((prefix) => key.startsWith(prefix));
}
