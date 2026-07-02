import { execSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Boots a fresh Postgres testcontainer, points DATABASE_URL at it,
 * and runs the workspace's Prisma migrations so every table the
 * integration suites need exists. Returns the live container handle
 * so callers can stop it on teardown.
 *
 * Why a fresh container per run instead of reusing the dev DB :
 *   - Tests get a known clean state — no cleanup between runs
 *   - Concurrent test runs (multiple devs, CI matrix) don't trample
 *     each other
 *   - The schema in the dev DB might lag the migrations after a
 *     pull ; the testcontainer always runs `prisma migrate deploy`
 *     so the schema matches `schema.prisma` exactly
 *
 * Cost : ~5 s container boot + ~2 s migration run on a warm Docker
 * daemon. Vitest's `globalSetup` runs this once for the whole test
 * process so the cost amortises across the suite.
 */

// Local handle type. We deliberately don't `import { ...
// PostgreSqlContainer ... } from "@testcontainers/postgresql"` at
// module-top because the import only resolves after `pnpm install`
// pulls the dep — keeping it lazy means workspace `pnpm typecheck`
// stays green even on a fresh clone before `pnpm install` runs.
export type StartedDb = {
  /** Stop the container ; idempotent. */
  stop: () => Promise<void>;
  /** The live `postgres://...` connection URL pointed at the container. */
  databaseUrl: string;
};

const POSTGRES_IMAGE = "postgres:16-alpine";

type PostgresBuilder = {
  withDatabase(db: string): PostgresBuilder;
  withUsername(name: string): PostgresBuilder;
  withPassword(pw: string): PostgresBuilder;
  withCommand(cmd: string[]): PostgresBuilder;
  start(): Promise<{
    getConnectionUri(): string;
    stop(): Promise<void>;
  }>;
};

type PostgresModule = {
  PostgreSqlContainer: new (image: string) => PostgresBuilder;
};

export async function startTestDb(): Promise<StartedDb> {
  // Lazy-import keeps the typecheck graph small + lets the file be
  // type-checked without `@testcontainers/postgresql` resolved.
  const tc = (await import("@testcontainers/postgresql" as string)) as PostgresModule;
  const container = await new tc.PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase("monark_test")
    .withUsername("postgres")
    .withPassword("postgres")
    // Faster boot at the cost of durability ; we don't care about
    // either inside an ephemeral test container.
    .withCommand(["postgres", "-c", "fsync=off", "-c", "synchronous_commit=off"])
    .start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;

  // Resolve the workspace root from this file's location so the
  // command works whether we're invoked from packages/<name>/tests
  // or services/api/tests. Walk up : src → test-utils → packages → repo root.
  const repoRoot = resolve(__dirname, "..", "..", "..");
  // Run Prisma migrations against the fresh container. `migrate
  // deploy` is the prod-style runner — applies pending migrations
  // without prompting. We run it via the workspace's `db:migrate`
  // script so any team-added hooks (seed, generate) flow through
  // the same entry point.
  execSync("pnpm db:migrate", {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: "inherit",
  });

  return {
    databaseUrl,
    stop: async () => {
      await container.stop();
    },
  };
}

export async function stopTestDb(db: StartedDb): Promise<void> {
  await db.stop();
}

/**
 * Truncates every table the test touched, in dependency order. Used
 * inside `beforeEach` so each test starts from a known clean slate
 * without paying the cost of a full container rebuild.
 *
 * Prisma's `$executeRawUnsafe` is direct SQL ; we lean on
 * `TRUNCATE … RESTART IDENTITY CASCADE` so foreign-key references
 * cascade-clear without us having to thread the order. Pass the
 * tables in any order ; the CASCADE handles the rest.
 */
export async function truncate(
  prismaClient: { $executeRawUnsafe: (sql: string) => Promise<unknown> },
  tables: string[],
): Promise<void> {
  if (tables.length === 0) return;
  const quoted = tables.map((t) => `"${t}"`).join(", ");
  await prismaClient.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}
