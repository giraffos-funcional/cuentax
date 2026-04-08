/**
 * CUENTAX — API Client
 * Client HTTP centralizado para comunicarse con el BFF.
 * Intercepta 401 y renueva el token automáticamente.
 */

import axios from 'axios'
import { useAuthStore } from '@/stores/auth.store'

const BFF_URL = process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000'

export const apiClient = axios.create({
  baseURL: BFF_URL,
  withCredentials: true, // Enviar cookies HttpOnly (refresh token)
  // Don't set Content-Type here — axios auto-detects FormData (multipart)
  // and JSON. Setting it globally breaks file uploads.
})

// On app load: recover access token from sessionStorage (saved during company switch)
if (typeof window !== 'undefined') {
  const switchToken = sessionStorage.getItem('cuentax_switch_token')
  if (switchToken) {
    sessionStorage.removeItem('cuentax_switch_token')
    useAuthStore.getState().setAccessToken(switchToken)
  }
}

// Request interceptor: inyectar access token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: auto-refresh en 401
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Encolar requests mientras se refresca
        return new Promise((resolve) => {
          refreshQueue.push((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(apiClient(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post(`${BFF_URL}/api/v1/auth/refresh`, {}, { withCredentials: true })
        const newToken = data.access_token

        useAuthStore.getState().setAccessToken(newToken)
        refreshQueue.forEach((cb) => cb(newToken))
        refreshQueue = []

        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return apiClient(originalRequest)
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)
