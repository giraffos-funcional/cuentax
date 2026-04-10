/**
 * CUENTAX Mobile — Push Notifications Setup
 * Expo notifications registration, token management, and handler config.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@/lib/api-client';

const PUSH_TOKEN_KEY = 'cuentax-expo-push-token';
const DEVICE_ID_KEY = 'cuentax-device-id';

/** Generate a stable device ID */
async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Configure the notification handler for foreground behavior.
 * Should be called once at app startup, outside of components.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Register for push notifications.
 * 1. Request permissions
 * 2. Get Expo push token
 * 3. POST token to BFF
 * 4. Store token for deduplication
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'CuentaX',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7c3aed',
    });
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  let expoPushToken: string;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    expoPushToken = tokenData.data;
  } catch (error) {
    console.warn('Could not get push token (dev mode?):', error);
    return null;
  }

  // Check if we already registered this token
  const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (storedToken === expoPushToken) {
    return expoPushToken;
  }

  // Register token with BFF
  const deviceId = await getOrCreateDeviceId();
  try {
    await apiClient.post('/api/v1/push-tokens', {
      expo_push_token: expoPushToken,
      device_id: deviceId,
      platform: Platform.OS,
    });
    // Store token for deduplication
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, expoPushToken);
  } catch (error) {
    console.error('Failed to register push token with server:', error);
  }

  return expoPushToken;
}

/**
 * Unregister push token on logout.
 * Removes token from server and local storage.
 */
export async function unregisterPushToken(): Promise<void> {
  const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) return;

  try {
    await apiClient.delete(`/api/v1/push-tokens/${deviceId}`);
  } catch {
    // Best-effort — don't block logout
  }

  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}
