import { NextRequest, NextResponse } from 'next/server'
import { adminFetch, AdminApiError } from '@/lib/api'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    return NextResponse.json(await adminFetch('/auth/totp/disable', { method: 'POST', body }))
  } catch (err) {
    if (err instanceof AdminApiError) return NextResponse.json(err.body, { status: err.status })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
