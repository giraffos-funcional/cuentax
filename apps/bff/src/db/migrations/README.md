# CuentaX BFF — Drizzle Kit Migrations

## Overview

Database schema is defined in `src/db/schema.ts` using Drizzle ORM.
Migrations are generated and applied using Drizzle Kit.

## Commands

All commands run from `apps/bff/`:

```bash
# Generate a migration from schema changes (does NOT touch the database)
pnpm db:generate

# Apply pending migrations to the database
pnpm db:migrate

# Push schema directly to the database (dev only, skips migration files)
pnpm db:push

# Open Drizzle Studio to browse the database
pnpm db:studio
```

## Workflow

1. Edit `src/db/schema.ts` with your changes.
2. Run `pnpm db:generate` to create a new migration SQL file in this directory.
3. Review the generated SQL to confirm it matches your intent.
4. Run `pnpm db:migrate` to apply the migration (or `pnpm db:push` in local dev).
5. Commit the migration file alongside the schema change.

## Inline DDL in server.ts (Legacy)

`server.ts` currently contains inline `CREATE TABLE IF NOT EXISTS` statements
that run on every startup. This was the original bootstrap mechanism before
Drizzle Kit migrations were set up.

**Plan to remove:**

1. Validate that `drizzle-kit migrate` works correctly in local dev.
2. Deploy to staging and confirm schema is correct after migration.
3. Deploy to production with migrations; verify the inline DDL is redundant.
4. Once verified, remove the entire inline DDL block from `server.ts`
   (marked with `TODO: Remove after Drizzle Kit migrations are verified in production`).

**Important:** The inline DDL is already out of sync with `schema.ts` --
it is missing the `api_keys` and `webhook_endpoints` tables. This further
motivates the transition to Drizzle Kit as the single source of truth.

## Configuration

See `drizzle.config.ts` in the BFF root for dialect, credentials, and paths.
