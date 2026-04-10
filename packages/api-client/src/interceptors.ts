/**
 * @cuentax/api-client — Auth interceptor factory
 * Platform-agnostic 401 interceptor with token refresh queue.
 */

import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'
import { ENDPOINTS } from './endpoints'

export interface AuthInterceptorConfig {
  /** Return the current access token (from memory, store, etc.) */
  getAccessToken: () => string | null
  /** Persist the new access token after a refresh */
  setAccessToken: (token: string) => void
  /** Called when refresh fails — navigate to login, clear state, etc. */
  onAuthFailure: () => void
  /** Base URL for the refresh call (must match the client baseURL) */
  baseURL: string
  /** Whether to send cookies (HttpOnly refresh token) */
  withCredentials?: boolean
}

/**
 * Attach request + response interceptors to an Axios instance.
 * Handles:
 *   - Injecting Authorization header on every request
 *   - Queuing concurrent requests during a 401 token refresh
 *   - Calling onAuthFailure when refresh itself fails
 */
export function attachAuthInterceptors(
  client: AxiosInstance,
  config: AuthInterceptorConfig,
): void {
  // ── Request: inject Bearer token ──────────────────────────
  client.interceptors.request.use((reqConfig: InternalAxiosRequestConfig) => {
    const token = config.getAccessToken()
    if (token) {
      reqConfig.headers.Authorization = `Bearer ${token}`
    }
    return reqConfig
  })

  // ── Response: 401 refresh logic ───────────────────────────
  let isRefreshing = false
  let refreshQueue: Array<(token: string) => void> = []

  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // Queue this request until refresh completes
          return new Promise((resolve) => {
            refreshQueue.push((token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(client(originalRequest))
            })
          })
        }

        originalRequest._retry = true
        isRefreshing = true

        try {
          const { data } = await axios.post(
            `${config.baseURL}${ENDPOINTS.AUTH.REFRESH}`,
            {},
            { withCredentials: config.withCredentials ?? true },
          )
          const newToken: string = data.access_token

          config.setAccessToken(newToken)

          // Flush queued requests
          refreshQueue.forEach((cb) => cb(newToken))
          refreshQueue = []

          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return client(originalRequest)
        } catch {
          config.onAuthFailure()
          return Promise.reject(error)
        } finally {
          isRefreshing = false
        }
      }

      return Promise.reject(error)
    },
  )
}
