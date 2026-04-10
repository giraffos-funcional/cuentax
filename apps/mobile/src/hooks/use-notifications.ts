/**
 * CUENTAX Mobile — Notifications Hook
 * Handles notification listeners, deep linking, and token registration.
 */

import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import type { Subscription } from 'expo-notifications';
import {
  registerForPushNotifications,
  configureNotificationHandler,
} from '@/lib/notifications';

interface NotificationData {
  type?: string;
  id?: string;
  [key: string]: unknown;
}

interface UseNotificationsReturn {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
}

/** Configure handler once at module level */
configureNotificationHandler();

/**
 * Hook to manage push notification lifecycle.
 * Call once in the root layout or app providers.
 */
export function useNotificationListeners(): UseNotificationsReturn {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Subscription>(null!);
  const responseListener = useRef<Subscription>(null!);

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications().then((token) => {
      if (token) setExpoPushToken(token);
    });

    // Listener: notification received while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((incomingNotification) => {
        setNotification(incomingNotification);
      });

    // Listener: user tapped on notification — deep link
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as NotificationData;
        handleNotificationNavigation(data);
      });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return { expoPushToken, notification };
}

/**
 * Navigate to the appropriate screen based on notification type.
 */
function handleNotificationNavigation(data: NotificationData): void {
  switch (data.type) {
    case 'dte_status':
      if (data.id) {
        router.push(`/(stacks)/dte/${data.id}`);
      }
      break;

    case 'folio_low':
      router.push('/(stacks)/settings' as any);
      break;

    case 'payment':
      router.push('/(tabs)/documents' as any);
      break;

    case 'gasto':
      if (data.id) {
        router.push(`/(stacks)/gasto/${data.id}`);
      }
      break;

    default:
      // No specific deep link — open app normally
      break;
  }
}
