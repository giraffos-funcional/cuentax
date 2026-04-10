/**
 * @cuentax/types — Auth domain types
 * Extracted from apps/web/src/stores/auth.store.ts
 */

import { z } from 'zod'

// ── Interfaces ────────────────────────────────────────────────

export interface Company {
  id: number
  name: string
  rut: string
}

export interface User {
  uid: number
  name: string
  email: string
  company_id: number
  company_name: string
  company_rut: string
  companies: Company[]
}

export interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  access_token: string
}

export interface RefreshResponse {
  access_token: string
}

// ── Zod Schemas ───────────────────────────────────────────────

export const CompanySchema = z.object({
  id: z.number(),
  name: z.string(),
  rut: z.string(),
})

export const UserSchema = z.object({
  uid: z.number(),
  name: z.string(),
  email: z.string().email(),
  company_id: z.number(),
  company_name: z.string(),
  company_rut: z.string(),
  companies: z.array(CompanySchema),
})

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const LoginResponseSchema = z.object({
  user: UserSchema,
  access_token: z.string(),
})

export const RefreshResponseSchema = z.object({
  access_token: z.string(),
})
