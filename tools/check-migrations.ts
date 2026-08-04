// Migration ↔ schema drift guard.
//
// Replays every committed migration in `packages/db/prisma/migrations` into a
// throwaway shadow database and diffs the result against the committed
// `schema.prisma`. The diff should be empty — apart from a small allowlist of
// divergences the Prisma *datamodel* structurally can't represent, so
// `migrate diff` reports them forever (see ALLOWLIST). Any diff statement
// beyond those means real drift: a model was changed without a matching
// migration, or a migration was hand-edited away from the schema.
//
// This complements `gen:schema --check` (base + fragments → schema.prisma) :
// together they chain base/fragment → schema.prisma → migrations. The
// testcontainer suite already proves the migrations APPLY cleanly ; this proves
// they still MATCH the modeled schema.
//
// Needs an empty Postgres for Prisma's shadow DB ; point SHADOW_DATABASE_URL at
// one. CI provides a `postgres` service ; locally, any throwaway container:
//   docker run --rm -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=shadow -p 5433:5432 postgres:16-alpine
//   SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/shadow pnpm check:migrations
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const shadowUrl = process.env.SHADOW_DATABASE_URL;
if (!shadowUrl) {
  console.error(
    "check:migrations — SHADOW_DATABASE_URL is not set. Point it at an empty throwaway Postgres\n" +
      "  (Prisma replays the migrations into it, then drops them). See the header of this file.",
  );
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB = join(ROOT, "packages", "db");
const migrationsDir = join(DB, "prisma", "migrations");
const schemaPath = join(DB, "prisma", "schema.prisma");

// Emit the diff as SQL (rather than relying on --exit-code) so we can subtract
// the known-and-accepted divergences before deciding pass/fail.
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-migrations",
    migrationsDir,
    "--to-schema-datamodel",
    schemaPath,
    "--shadow-database-url",
    shadowUrl,
    "--script",
  ],
  { cwd: DB, encoding: "utf8", shell: process.platform === "win32" },
);

if (result.status !== 0) {
  console.error(
    "check:migrations — `prisma migrate diff` failed (is SHADOW_DATABASE_URL an empty, reachable Postgres?):\n" +
      (result.stderr || result.stdout || "").trim(),
  );
  process.exit(1);
}

// Split the SQL into statements, dropping `-- comment` lines and blanks.
const statements = (result.stdout ?? "")
  .split(";")
  .map((chunk) =>
    chunk
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .filter((s) => s.length > 0);

// Divergences the Prisma datamodel can't express, so `migrate diff` always
// reports them — NOT drift:
//   - DataRecord's jsonb GIN index is created by raw SQL in a migration
//     (Prisma's schema has no GIN/jsonb_path_ops index type), so the schema
//     datamodel doesn't know about it and the diff always "drops" it.
//   - TrustedDevice.expiresAt's dbgenerated default is the same expression the
//     migration wrote, re-formatted by Prisma's introspection
//     (`'400 days'::interval` ↔ `INTERVAL '400 days'`).
// Extend this list (with a comment) only for another genuine raw-SQL divergence.
const ALLOWLIST: RegExp[] = [
  /^DROP INDEX "DataRecord_data_gin"$/,
  /^ALTER TABLE "TrustedDevice" ALTER COLUMN "expiresAt" SET DEFAULT /,
];

const unexpected = statements.filter((s) => !ALLOWLIST.some((re) => re.test(s)));

if (unexpected.length === 0) {
  const known = statements.length;
  console.log(
    `check:migrations — OK: migrations reproduce schema.prisma` +
      (known ? ` (modulo ${known} allowlisted raw-SQL divergence(s)).` : "."),
  );
  process.exit(0);
}

console.error(
  "check:migrations — DRIFT: applying prisma/migrations does not reproduce schema.prisma.\n" +
    "Unexpected diff statement(s):\n" +
    unexpected.map((s) => `  ${s};`).join("\n") +
    "\n\nAdd a migration with `pnpm --filter @monark/db db:migrate:dev` (strip any spurious GIN\n" +
    "DROP INDEX per the migrate-dev gotcha), or — if this is another intentional raw-SQL\n" +
    "divergence — add it to the ALLOWLIST in tools/check-migrations.ts.",
);
process.exit(1);
