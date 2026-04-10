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
    default: 'CUENTAX — Plataforma Contable SII',
    template: '%s | CUENTAX',
  },
  description:
    'Plataforma de contabilidad y facturación electrónica con conexión directa al SII Chile. Emite DTEs, gestiona folios, consulta estados y más.',
  keywords: ['factura electrónica', 'SII Chile', 'DTE', 'boleta electrónica', 'contabilidad', 'cuentax'],
  authors: [{ name: 'CUENTAX', url: 'https://cuentax.cl' }],
  robots: { index: false, follow: false }, // Privado — no indexar
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CuentaX" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
