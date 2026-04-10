/**
 * CUENTAX Mobile — Secure Storage
 * Wrapper around expo-secure-store for token management.
 */

import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN: 'cuentax_access_token',
  REFRESH_TOKEN: 'cuentax_refresh_token',
  BIOMETRIC_ENABLED: 'cuentax_biometric_enabled',
} as const;

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
  } catch {
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(KEYS.BIOMETRIC_ENABLED);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEYS.BIOMETRIC_ENABLED, String(enabled));
}

export async function clearAll(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
    SecureStore.deleteItemAsync(KEYS.BIOMETRIC_ENABLED),
  ]);
}
