import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://cuentax:cuentax@localhost:5432/cuentax',
  },
  verbose: true,
  strict: true,
} satisfies Config
