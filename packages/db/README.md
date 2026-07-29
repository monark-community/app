# @monark/db

Owns the Prisma schema and the generated Prisma client. Every module's `/server/data/` imports its Prisma queries from `@monark/db`.

## Schema ownership

`prisma/schema.prisma` is **generated, not written** — it is assembled by `pnpm gen:schema` (part of `pnpm gen`) from:

- [`prisma/base.prisma`](prisma/base.prisma) — datasource + generator + every **core** module's models, each under its `// ── MODULE: <name> ──` banner.
- `packages/<module>/prisma/<module>.prisma` — one fragment per **extended** module ([calendar](../calendar/prisma/calendar.prisma), [kanban](../kanban/prisma/kanban.prisma) today), owning that module's models under its banner.

```prisma
// ── MODULE: auth ──────────────────────────────────────────
model User { ... }
```

Edit `base.prisma` (core) or a module's fragment (extended) — **never** the generated `schema.prisma`. After a schema change: `pnpm gen` (reassembles + regenerates), then `pnpm --filter @monark/db db:migrate:dev` for the migration. `pnpm check:tiers` rejects an extended-module banner that leaks into `base.prisma`, and CI fails on `schema.prisma` drift like any other generated artifact. Keep banners in sync with [`modules.manifest.ts`](../../modules.manifest.ts).

Note: core-model back-relations to a fragment's tables (`Organization.calendarEvents`, `Role.kanbanBoardAccess`, …) still live in `base.prisma`, since Prisma requires both sides of a relation ; full core↔extended FK decoupling is tracked in [docs/todo/backlog.md](../../docs/todo/backlog.md).

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
