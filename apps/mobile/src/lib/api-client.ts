/**
 * CUENTAX Mobile — API Client
 * Axios instance configured for React Native.
 * Token refresh uses body-based refresh (not cookies).
 */

import axios, { type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import * as secureStorage from '@/lib/secure-storage';

const API_URL =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env['EXPO_PUBLIC_API_URL'] ??
  'https://cuentaxapi.giraffos.com';

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor: inject access token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: auto-refresh on 401
let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null): void {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  refreshQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue this request while refresh is in progress
      return new Promise<string>((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await secureStorage.getRefreshToken();

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
        refresh_token: refreshToken,
      });

      const newAccessToken: string = data.access_token;
      const newRefreshToken: string | undefined = data.refresh_token;

      // Update tokens
      useAuthStore.getState().setAccessToken(newAccessToken);

      if (newRefreshToken) {
        await secureStorage.setRefreshToken(newRefreshToken);
      }

      processQueue(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      // Clear auth state and navigate to login
      useAuthStore.getState().clearAuth();
      await secureStorage.clearAll();
      router.replace('/(auth)/login');

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
