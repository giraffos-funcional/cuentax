/**
 * CUENTAX Mobile — Offline Queue
 * Queues failed mutations for replay when connectivity is restored.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/lib/api-client';

const QUEUE_KEY = 'cuentax-offline-queue';

export interface QueuedMutation {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: unknown;
  timestamp: number;
}

/** Read the full queue from AsyncStorage */
async function readQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedMutation[];
  } catch {
    return [];
  }
}

/** Write the full queue to AsyncStorage */
async function writeQueue(queue: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Add a failed mutation to the offline queue */
export async function addToQueue(
  mutation: Omit<QueuedMutation, 'id' | 'timestamp'>,
): Promise<void> {
  const queue = await readQueue();
  const entry: QueuedMutation = {
    ...mutation,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  queue.push(entry);
  await writeQueue(queue);
}

/**
 * Process all pending mutations in order.
 * Removes each mutation on success, stops on first failure.
 * Returns the number of successfully processed mutations.
 */
export async function processQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  let processed = 0;

  for (const mutation of queue) {
    try {
      switch (mutation.method) {
        case 'POST':
          await apiClient.post(mutation.endpoint, mutation.body);
          break;
        case 'PUT':
          await apiClient.put(mutation.endpoint, mutation.body);
          break;
        case 'PATCH':
          await apiClient.patch(mutation.endpoint, mutation.body);
          break;
        case 'DELETE':
          await apiClient.delete(mutation.endpoint, { data: mutation.body });
          break;
      }
      processed++;
    } catch {
      // Stop processing on first failure — remaining stay in queue
      break;
    }
  }

  if (processed > 0) {
    const remaining = queue.slice(processed);
    await writeQueue(remaining);
  }

  return processed;
}

/** Get the number of pending mutations in the queue */
export async function getQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/** Clear the entire queue (e.g., on logout) */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
