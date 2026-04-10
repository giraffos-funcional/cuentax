/**
 * CUENTAX Mobile — Auth Store (Zustand)
 * Same shape as web auth store. Persists user data to AsyncStorage.
 * Access token stays in memory; refresh token in SecureStore.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Company {
  id: number;
  name: string;
  rut: string;
}

interface User {
  uid: number;
  name: string;
  email: string;
  company_id: number;
  company_name: string;
  company_rut: string;
  companies: Company[];
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;

  // Actions
  setAuth: (user: User, accessToken: string) => void;
  clearAuth: () => void;
  setAccessToken: (token: string) => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),

      clearAuth: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),

      setAccessToken: (token) =>
        set({ accessToken: token }),

      setUser: (user) =>
        set({ user }),
    }),
    {
      name: 'cuentax-auth',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist user data, NOT the access token (security)
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

export type { Company, User, AuthState };
