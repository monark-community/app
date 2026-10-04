---
type: how-to
---

# Change the database schema

Add or change a table and ship the migration that goes with it. `packages/db/prisma/schema.prisma` is generated; never edit it.

Before you add a table, check whether per-user or per-organization values without filtering, sorting or foreign keys fit the metadata sidecar instead (`setUserMetadataValue` / `setOrganizationMetadataValue`); it needs no migration.

1. Edit the model where it lives:
   - a core module: `packages/db/prisma/base.prisma`, under the module's `// ── MODULE: <name> ──` banner;
   - an extended module: its own `packages/<name>/prisma/<name>.prisma` fragment, under the same banner. Extended modules never touch `base.prisma`.
2. Reassemble the schema:
   ```sh
   pnpm gen
   ```
3. Write the migration without applying it:
   ```sh
   pnpm --filter @monark/db exec prisma migrate dev --create-only --name <what-changed>
   ```
   It appears in `packages/db/prisma/migrations/<timestamp>_<what-changed>/migration.sql`.
4. Open `migration.sql` and delete the line `DROP INDEX "DataRecord_data_gin";` if it's there. Prisma can't see that hand-written index and tries to drop it in every migration.
5. Apply the migration to your local database:
   ```sh
   pnpm db:migrate
   ```
6. Check the migrations reproduce the schema, using a throwaway Postgres:
   ```sh
   docker run --rm -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=shadow -p 5433:5432 postgres:16-alpine
   SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/shadow pnpm check:migrations
   ```
7. Commit the base or fragment change, the regenerated `schema.prisma` and the migration together.

Good to know:

- The database scripts read `packages/db/.env`, so `DATABASE_URL` and `DIRECT_URL` must be set there as well as in `services/api/.env`. Bootstrap does this.
- Never edit a migration that has been applied anywhere else. Add a new one.
- Plain `migrate dev` without `--create-only` waits for keyboard input and hangs in scripts and agent sessions.

Next: [Write tests](write-tests.md)
