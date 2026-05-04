import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const COOKIE_NAME = 'cx_admin_token'
const COOKIE_TTL_SECONDS = 60 * 60 // matches admin JWT TTL

export function setAdminCookie(token: string): void {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_TTL_SECONDS,
  })
}

export function clearAdminCookie(): void {
  cookies().delete(COOKIE_NAME)
}

export function getAdminToken(): string | undefined {
  return cookies().get(COOKIE_NAME)?.value
}

/** Use inside server components inside the (dashboard) group. */
export function requireSession(): void {
  if (!getAdminToken()) redirect('/login')
}
