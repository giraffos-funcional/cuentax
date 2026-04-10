/**
 * @cuentax/stores — Auth Store factory
 * Platform-agnostic Zustand store with pluggable persistence.
 *
 * Web:    createAuthStore(localStorage)
 * Mobile: createAuthStore(secureStoreAdapter)
 */

import { createStore } from 'zustand/vanilla'
import { persist, type StateStorage } from 'zustand/middleware'
import type { User } from '@cuentax/types'

// ── State + Actions ─────────────────────────────────────────

export interface AuthStoreState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
}

export interface AuthStoreActions {
  setAuth: (user: User, accessToken: string) => void
  clearAuth: () => void
  setAccessToken: (token: string) => void
}

export type AuthStore = AuthStoreState & AuthStoreActions

// ── Factory ─────────────────────────────────────────────────

/**
 * Create the auth store with optional persistence.
 *
 * @param storage - Platform-specific storage adapter.
 *   - Web: `localStorage` (implements StateStorage via getItem/setItem/removeItem)
 *   - React Native: wrap expo-secure-store in a StateStorage adapter
 *   - Omit for no persistence (e.g. SSR, tests)
 */
export function createAuthStore(storage?: StateStorage) {
  const initialState: AuthStoreState = {
    user: null,
    accessToken: null,
    isAuthenticated: false,
  }

  if (!storage) {
    // No persistence — pure in-memory store
    return createStore<AuthStore>()((set) => ({
      ...initialState,
      setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
      clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
      setAccessToken: (token) => set({ accessToken: token }),
    }))
  }

  return createStore<AuthStore>()(
    persist(
      (set) => ({
        ...initialState,
        setAuth: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
        clearAuth: () => set({ user: null, accessToken: null, isAuthenticated: false }),
        setAccessToken: (token) => set({ accessToken: token }),
      }),
      {
        name: 'cuentax-auth',
        storage: {
          getItem: (name) => {
            const value = storage.getItem(name)
            // StateStorage.getItem can return string | null | Promise
            if (value instanceof Promise) {
              return value.then((v) => (v ? JSON.parse(v) : null))
            }
            return value ? JSON.parse(value) : null
          },
          setItem: (name, value) => {
            storage.setItem(name, JSON.stringify(value))
          },
          removeItem: (name) => {
            storage.removeItem(name)
          },
        },
        // Only persist user data, NOT the access token (security)
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }) as AuthStore,
      },
    ),
  )
}
