import { redirect } from 'next/navigation'
import { getAdminToken } from '@/lib/auth'

export default function RootPage() {
  redirect(getAdminToken() ? '/dashboard' : '/login')
}
