/**
 * CUENTAX — Auth Store (Zustand)
 * Estado global de autenticación. Persiste en localStorage.
 * El access token se guarda solo en memoria (no en storage por seguridad).
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Company {
  id: number
  name: string
  rut: string
  country_code?: string  // 'CL' | 'US'
  locale?: string        // 'es-CL' | 'en-US'
  currency?: string      // 'CLP' | 'USD'
}

interface User {
  uid: number
  name: string
  email: string
  company_id: number
  company_name: string
  company_rut: string
  companies: Company[]
  // Multi-country context for active company
  country_code: string   // 'CL' | 'US'
  locale: string         // 'es-CL' | 'en-US'
  currency: string       // 'CLP' | 'USD'
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean

  // Actions
  setAuth: (user: User, accessToken: string) => void
  clearAuth: () => void
  setAccessToken: (token: string) => void
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
    }),
    {
      name: 'cuentax-auth',
      // Solo persistir datos del usuario, NO el access token
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
)
