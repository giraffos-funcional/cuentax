/**
 * CUENTAX Mobile — Network Status Hook
 * Monitors connectivity and triggers offline queue processing on reconnect.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { processQueue, getQueueSize } from '@/lib/offline-queue';

interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
  pendingMutations: number;
  isProcessingQueue: boolean;
  retryQueue: () => Promise<void>;
}

export function useNetworkStatus(): NetworkStatus {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);
  const [type, setType] = useState('unknown');
  const [pendingMutations, setPendingMutations] = useState(0);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const wasDisconnectedRef = useRef(false);

  const refreshQueueSize = useCallback(async () => {
    const size = await getQueueSize();
    setPendingMutations(size);
  }, []);

  const retryQueue = useCallback(async () => {
    if (isProcessingQueue) return;
    setIsProcessingQueue(true);
    try {
      await processQueue();
      await refreshQueueSize();
    } finally {
      setIsProcessingQueue(false);
    }
  }, [isProcessingQueue, refreshQueueSize]);

  useEffect(() => {
    // Initial fetch
    refreshQueueSize();

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? false;
      const reachable = state.isInternetReachable;

      setIsConnected(connected);
      setIsInternetReachable(reachable);
      setType(state.type);

      // If we were disconnected and now reconnected, process queue
      if (wasDisconnectedRef.current && connected && reachable) {
        wasDisconnectedRef.current = false;
        // Process queue on reconnect
        setIsProcessingQueue(true);
        processQueue()
          .then(() => refreshQueueSize())
          .finally(() => setIsProcessingQueue(false));
      }

      if (!connected) {
        wasDisconnectedRef.current = true;
      }
    });

    return () => unsubscribe();
  }, [refreshQueueSize]);

  // Poll queue size periodically (for mutations added elsewhere)
  useEffect(() => {
    const interval = setInterval(refreshQueueSize, 10_000);
    return () => clearInterval(interval);
  }, [refreshQueueSize]);

  return {
    isConnected,
    isInternetReachable,
    type,
    pendingMutations,
    isProcessingQueue,
    retryQueue,
  };
}
