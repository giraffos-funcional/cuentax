/**
 * Language toggle — sets `cx_admin_lang` cookie via a server action and
 * triggers a Next.js revalidation by redirecting to the same path.
 */
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

const COOKIE_NAME = 'cx_admin_lang'

export function LangToggle() {
  const current = cookies().get(COOKIE_NAME)?.value === 'en' ? 'en' : 'es'

  async function setLang(formData: FormData) {
    'use server'
    const next = String(formData.get('lang') ?? 'es')
    cookies().set(COOKIE_NAME, next, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    })
    revalidatePath('/')
  }

  return (
    <form action={setLang} className="flex items-center gap-1 text-xs">
      <input type="hidden" name="lang" value={current === 'es' ? 'en' : 'es'} />
      <button
        type="submit"
        className="px-2 py-1 rounded hover:bg-muted text-muted-foreground"
        title={current === 'es' ? 'Switch to English' : 'Cambiar a Español'}
      >
        {current === 'es' ? '🇨🇱 ES' : '🇺🇸 EN'}
      </button>
    </form>
  )
}
