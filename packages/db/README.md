# @monark/db

Owns [`prisma/schema.prisma`](prisma/schema.prisma) and the generated Prisma client. Every module's `/server/data/` imports its Prisma queries from `@monark/db`.

## Schema ownership

Modules own logical slices of the schema. Add tables under a module-banner comment:

```prisma
// ── MODULE: auth ──────────────────────────────────────────
model User { ... }
```

Keep banners in sync with [`modules.manifest.ts`](../../modules.manifest.ts). A future pre-commit check will warn when a PR edits outside its module's slice without explicit opt-in.

## Scripts

```bash
pnpm --filter @monark/db db:generate    # regenerate the Prisma client
pnpm --filter @monark/db db:migrate     # prisma migrate deploy
pnpm --filter @monark/db db:migrate:dev # prisma migrate dev (creates a new migration)
pnpm --filter @monark/db db:reset       # drop + reapply + seed
pnpm --filter @monark/db db:studio      # open Prisma Studio
pnpm --filter @monark/db db:seed        # run src/seed.ts
```

`prisma generate` also runs automatically on `pnpm install` via the `postinstall` hook.

## Environment

`DATABASE_URL` (pooled) and `DIRECT_URL` (for migrations). Set in `services/api/.env` at runtime; the db package reads them through the Prisma datasource block.
