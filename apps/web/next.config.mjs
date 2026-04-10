/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'cuentax.cl',
        'www.cuentax.cl',
      ],
    },
  },
  env: {
    NEXT_PUBLIC_BFF_URL: process.env['NEXT_PUBLIC_BFF_URL'] ?? 'http://localhost:4000',
    NEXT_PUBLIC_APP_NAME: process.env['NEXT_PUBLIC_APP_NAME'] ?? 'CUENTAX',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  compress: true,
  poweredByHeader: false,
}

export default nextConfig
