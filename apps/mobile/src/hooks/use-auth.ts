/**
 * CUENTAX Mobile — Auth Hooks
 * Login, logout, biometric unlock, company switch.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';
import * as secureStorage from '@/lib/secure-storage';
import { authenticateWithBiometrics, isBiometricAvailable } from '@/lib/biometrics';
import { useAuthStore, type User } from '@/stores/auth.store';

interface LoginPayload {
  email: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export function useLogin() {
  const { setAuth } = useAuthStore();

  return useMutation({
    mutationFn: async (payload: LoginPayload): Promise<LoginResponse> => {
      const { data } = await apiClient.post<LoginResponse>(
        '/api/v1/auth/login',
        payload,
      );
      return data;
    },
    onSuccess: async (data) => {
      setAuth(data.user, data.access_token);
      await secureStorage.setRefreshToken(data.refresh_token);
      router.replace('/(tabs)');
    },
  });
}

export function useLogout() {
  const { clearAuth } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post('/api/v1/auth/logout');
      } catch {
        // Logout even if server request fails
      }
    },
    onSettled: async () => {
      clearAuth();
      await secureStorage.clearAll();
      queryClient.clear();
      router.replace('/(auth)/login');
    },
  });
}

export function useBiometricUnlock() {
  const { setAccessToken } = useAuthStore();

  return useMutation({
    mutationFn: async () => {
      const available = await isBiometricAvailable();
      if (!available) {
        throw new Error('Biometric authentication not available');
      }

      const result = await authenticateWithBiometrics('Desbloquear CuentaX');
      if (!result.success) {
        throw new Error(result.error ?? 'Biometric authentication failed');
      }

      // After biometric success, refresh token from SecureStore
      const refreshToken = await secureStorage.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token — please log in again');
      }

      const { data } = await apiClient.post('/api/v1/auth/refresh', {
        refresh_token: refreshToken,
      });

      return data;
    },
    onSuccess: (data) => {
      setAccessToken(data.access_token);
      if (data.refresh_token) {
        secureStorage.setRefreshToken(data.refresh_token);
      }
      router.replace('/(tabs)');
    },
  });
}

export function useSwitchCompany() {
  const { setAuth } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyId: number) => {
      const { data } = await apiClient.post('/api/v1/auth/switch-company', {
        company_id: companyId,
      });
      return data;
    },
    onSuccess: async (data) => {
      setAuth(data.user, data.access_token);
      if (data.refresh_token) {
        await secureStorage.setRefreshToken(data.refresh_token);
      }
      queryClient.invalidateQueries();
    },
  });
}

export function useMe() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get<User>('/api/v1/auth/me');
      return data;
    },
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
