# Schema-change guidelines

How to change the database in this monorepo, for agents and humans. Read this before you touch a Prisma model or add a migration. The schema is **assembled by codegen** and guarded by CI, so the wrong move (hand-editing the generated file, or committing a drifted migration) fails the build.

Operational commands live in the [development guide](../technical-documentation/development.md#database) ; this page is the _how to do it right_.

## TL;DR

- **Never hand-edit `packages/db/prisma/schema.prisma`.** It's generated. Edit `base.prisma` (core models) or a module's `prisma/<module>.prisma` fragment, then `pnpm gen`.
- **Where a model lives follows the tier.** Core models → `base.prisma`. Extended (and any module that owns its own tables) → `packages/<module>/prisma/<module>.prisma` under its `// ── MODULE: <name> ──` banner. `pnpm check:tiers` fails an extended-module edit to `base.prisma`.
- **Workflow:** edit → `pnpm gen` → `pnpm --filter @monark/db db:migrate:dev` → **strip the spurious GIN `DROP INDEX`** from the new migration (see below) → commit.
- **`migrate dev` creates, `migrate deploy` applies.** Use `db:migrate:dev` locally to author a migration ; prod/CI runs `db:migrate` (deploy).
- **`pnpm check:migrations`** verifies the migrations reproduce `schema.prisma` ; it needs a `SHADOW_DATABASE_URL` (an empty throwaway Postgres).

## Where models live

`pnpm gen:schema` concatenates the generated `schema.prisma` from :

- `packages/db/prisma/base.prisma` — the datasource, generator, and **most core modules'** models, each under a `// ── MODULE: <name> ──` banner.
- `packages/<module>/prisma/<module>.prisma` — one fragment per module that owns its tables outside `base.prisma` : the **extended** modules (`calendar`, `kanban`) plus the **core** `api-keys` module.

Rules (enforced by `pnpm check:tiers`) :

- An **extended module MUST NOT** edit `base.prisma` or reshape another module's tables. It adds **its own** models in its own fragment, and owns the migration.
- Core-model **back-relations** to a fragment's tables (Prisma requires both sides of a relation) still live in `base.prisma` — that's expected, not a violation.
- For per-user / per-org data that needs no indexing, relations, or FKs, prefer the **metadata sidecar** (`setUserMetadataValue` / `setOrganizationMetadataValue`) over a new table.

## The workflow

1. **Edit** the model — in `base.prisma` (core) or the module fragment (extended).
2. **`pnpm gen`** — reassembles `schema.prisma` (and regenerates the event union + tRPC router). Do this before migrating so the migration diffs against the assembled schema.
3. **`pnpm --filter @monark/db db:migrate:dev`** — Prisma creates a new `packages/db/prisma/migrations/<timestamp>_<name>/migration.sql` and applies it to your local DB. Give it a descriptive name.
4. **Handle the GIN gotcha** (below).
5. **Commit** the fragment/base change _and_ the new migration together.

> **Note:** `db:*` scripts read env from `packages/db/.env` — `DATABASE_URL` / `DIRECT_URL` must be set there (duplicated from the api's env), not just in `services/api/.env`.

## The `migrate dev` GIN-index drift gotcha

`DataRecord`'s JSONB `data` column has a **GIN index** (`DataRecord_data_gin`) created by raw SQL in its migration, because Prisma's datamodel can't express a `gin(... jsonb_path_ops)` index. Prisma doesn't know about it, so **every** `prisma migrate dev` (and `migrate diff`) reports a phantom :

```sql
DROP INDEX "DataRecord_data_gin";
```

This is **not** real drift — it's Prisma trying to "reconcile" an index it can't see. When `db:migrate:dev` writes a new migration :

- **Open the generated `migration.sql` and delete that `DROP INDEX "DataRecord_data_gin";` line** (and any paired re-create) before committing. The alternative is `prisma migrate dev --create-only`, which writes the SQL without applying it so you can strip the line first, then `db:migrate` to apply.
- `pnpm check:migrations` allow-lists this exact statement (`tools/check-migrations.ts`), so a migration that _leaves it in_ is caught there — but strip it at authoring time to keep migrations clean.

If you add another hand-written raw-SQL index that Prisma can't model, expect the same phantom for it, and extend the allow-list in `tools/check-migrations.ts` with a comment explaining why.

## Verifying migrations

`pnpm check:migrations` replays every migration against an empty database and asserts the result matches `schema.prisma` (minus the allow-listed phantoms). It needs an empty Postgres via `SHADOW_DATABASE_URL` — spin up a throwaway container (see the header comment in `tools/check-migrations.ts`). It's **not** in the standard pre-PR gate line (it needs that extra DB), so run it yourself after touching migrations.

## Don'ts

- Don't edit the generated `schema.prisma` — your change is overwritten on the next `pnpm gen`, and CI fails on drift.
- Don't edit a **migration that's already been applied in an environment** — migrations are an append-only history ; add a new one.
- Don't reach into another module's models from an extended module ; compose via core read interfaces, the event bus, or the metadata sidecar (see [extensibility-contract.md](../technical-documentation/extensibility-contract.md)).
