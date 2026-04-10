/**
 * @cuentax/api-client — Platform-agnostic API client factory
 * No window, no localStorage, no sessionStorage references.
 * Consumers inject their own token storage and auth failure handler.
 */

import axios, { type AxiosInstance } from 'axios'
import { attachAuthInterceptors } from './interceptors'

export interface ApiClientConfig {
  /** BFF base URL (e.g. "https://api.cuentax.cl" or "http://localhost:4000") */
  baseURL: string
  /** Return the current access token from your store/memory */
  getAccessToken: () => string | null
  /** Persist the refreshed access token */
  setAccessToken: (token: string) => void
  /** Called when token refresh fails — clear state, navigate to login */
  onAuthFailure: () => void
  /** Send cookies for HttpOnly refresh token. Default: true */
  withCredentials?: boolean
}

/**
 * Create a configured Axios instance with auth interceptors.
 *
 * Usage (Next.js web):
 * ```ts
 * const apiClient = createApiClient({
 *   baseURL: process.env.NEXT_PUBLIC_BFF_URL!,
 *   getAccessToken: () => useAuthStore.getState().accessToken,
 *   setAccessToken: (t) => useAuthStore.getState().setAccessToken(t),
 *   onAuthFailure: () => { useAuthStore.getState().clearAuth(); window.location.href = '/login' },
 * })
 * ```
 *
 * Usage (Expo React Native):
 * ```ts
 * const apiClient = createApiClient({
 *   baseURL: Config.BFF_URL,
 *   getAccessToken: () => authStore.getState().accessToken,
 *   setAccessToken: (t) => authStore.getState().setAccessToken(t),
 *   onAuthFailure: () => { authStore.getState().clearAuth(); router.replace('/login') },
 *   withCredentials: false, // RN does not use HttpOnly cookies
 * })
 * ```
 */
export function createApiClient(config: ApiClientConfig): AxiosInstance {
  const client = axios.create({
    baseURL: config.baseURL,
    withCredentials: config.withCredentials ?? true,
    // Don't set Content-Type — axios auto-detects FormData vs JSON
  })

  attachAuthInterceptors(client, {
    baseURL: config.baseURL,
    getAccessToken: config.getAccessToken,
    setAccessToken: config.setAccessToken,
    onAuthFailure: config.onAuthFailure,
    withCredentials: config.withCredentials,
  })

  return client
}
