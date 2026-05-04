import { NextResponse } from 'next/server'
import { adminFetch, AdminApiError } from '@/lib/api'

export async function POST() {
  try {
    return NextResponse.json(await adminFetch('/auth/totp/enroll', { method: 'POST' }))
  } catch (err) {
    if (err instanceof AdminApiError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
