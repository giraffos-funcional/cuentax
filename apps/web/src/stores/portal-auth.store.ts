/**
 * CUENTAX — Portal del Trabajador Auth Store (Zustand)
 * Separate auth state for employee portal. Persists employee info in localStorage.
 * Access token is kept only in memory for security.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PortalEmployee {
  id: number
  name: string
  rut: string
  job_title: string
  department: string
  company_name?: string
  company_logo?: string | null
}

interface PortalAuthState {
  employee: PortalEmployee | null
  accessToken: string | null
  isAuthenticated: boolean

  // Actions
  setAuth: (employee: PortalEmployee, accessToken: string) => void
  clearAuth: () => void
  setAccessToken: (token: string) => void
}

export const usePortalAuthStore = create<PortalAuthState>()(
  persist(
    (set) => ({
      employee: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (employee, accessToken) =>
        set({ employee, accessToken, isAuthenticated: true }),

      clearAuth: () =>
        set({ employee: null, accessToken: null, isAuthenticated: false }),

      setAccessToken: (token) =>
        set({ accessToken: token }),
    }),
    {
      name: 'cuentax-portal-auth',
      // Only persist employee data, NOT the access token.
      // isAuthenticated is derived from accessToken presence at runtime.
      partialize: (state) => ({
        employee: state.employee,
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydration, isAuthenticated is false (no token persisted).
        // User must re-login. This prevents flash-redirect on refresh.
        if (state) {
          state.isAuthenticated = false
          state.accessToken = null
        }
      },
    },
  ),
)
