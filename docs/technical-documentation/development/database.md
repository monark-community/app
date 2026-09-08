# Database

The Prisma schema is **assembled by codegen**, so `pnpm gen` runs before you migrate (it also regenerates the event union + tRPC router). Scripts run per-package via `pnpm --filter @monark/db <script>` ; the root exposes only `db:migrate` and `db:reset` :

| Script           | Does                                                               |
| ---------------- | ------------------------------------------------------------------ |
| `db:generate`    | Regenerate the Prisma client.                                      |
| `db:migrate`     | `prisma migrate deploy` ; apply committed migrations (prod-style). |
| `db:migrate:dev` | `prisma migrate dev` ; create + apply a new migration in dev.      |
| `db:reset`       | Drop + re-apply + reseed.                                          |
| `db:studio`      | Prisma Studio GUI.                                                 |
| `db:seed`        | Seed (a no-op placeholder today).                                  |

Typical change flow : edit `base.prisma` (core) or a module's `prisma/<module>.prisma` fragment → `pnpm gen` → `pnpm --filter @monark/db db:migrate:dev`. **Watch the GIN-index drift gotcha** when creating a migration ; see [schema-changes](../../agents/schema-changes.md).
