/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3001',
        'admin.cuentax.cl',
        'cuentaxadmin.giraffos.com',
      ],
    },
  },
  env: {
    BFF_URL: process.env.BFF_URL ?? 'http://localhost:4000',
    NEXT_PUBLIC_APP_NAME: 'Cuentax Admin',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
