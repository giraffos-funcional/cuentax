import { NextResponse } from 'next/server'
import { adminFetch, AdminApiError } from '@/lib/api'

export async function GET() {
  try {
    const me = await adminFetch('/me')
    return NextResponse.json(me)
  } catch (err) {
    if (err instanceof AdminApiError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
