import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Giraffos SII — Facturación Electrónica',
    template: '%s | Giraffos SII',
  },
  description:
    'Plataforma de facturación electrónica con conexión directa al SII Chile. Emite DTEs, gestiona folios, consulta estados y más.',
  keywords: ['factura electrónica', 'SII Chile', 'DTE', 'boleta electrónica', 'contabilidad'],
  authors: [{ name: 'Giraffos', url: 'https://giraffos.com' }],
  robots: { index: false, follow: false }, // Privado — no indexar
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
