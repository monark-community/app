// Aborts the integration test run if `DATABASE_URL` doesn't point at a
// testcontainer-managed Postgres. Wired as a `setupFiles` entry from
// every `vitest.integration.config.ts` so it runs once per test file
// (before any user code), AFTER `globalSetup` has had its chance to
// boot the container + rewrite the env var.
//
// Why this exists : the integration suites do `db.organization.upsert`
// with deterministic IDs ("ff-org-a", "test-org-webhooks", …). On the
// testcontainer those rows are fine — the container is destroyed at
// suite end. But if someone runs an integration spec via an IDE
// extension that picks the unit config (no globalSetup, no
// testcontainer), the tests silently write to the dev DB and leave
// orphans. Failing loud here ("integration tests must run via
// `pnpm test:integration`") is the safety net.
//
// Marker chosen : the path component `/monark_test` of the URL the
// testcontainer is constructed with in `db.ts`
// (`.withDatabase("monark_test")`). Local dev uses `/postgres` ; CI's
// supabase uses `/postgres` too — both are caught.

const DATABASE_URL = process.env["DATABASE_URL"];
const TESTCONTAINER_MARKER = "/monark_test";

if (!DATABASE_URL) {
  throw new Error(
    "Integration test run aborted : DATABASE_URL is unset. " +
      "Integration tests must run via `pnpm test:integration` " +
      "(or a package-level `pnpm --filter <pkg> test:integration`), " +
      "which boots a Postgres testcontainer via globalSetup. " +
      "Running the spec directly (e.g. through an IDE extension that " +
      "doesn't pick `vitest.integration.config.ts`) is not supported.",
  );
}

if (!DATABASE_URL.includes(TESTCONTAINER_MARKER)) {
  throw new Error(
    "Integration test run aborted : DATABASE_URL does not point at the " +
      `testcontainer DB (expected the path component "${TESTCONTAINER_MARKER}", ` +
      `got ${JSON.stringify(DATABASE_URL)}). This usually means the spec ` +
      "was launched without `pnpm test:integration` — the testcontainer " +
      "globalSetup never ran and the spec would write to whatever DB " +
      "DATABASE_URL pointed at (likely your dev Supabase). Re-run with " +
      "`pnpm --filter <pkg> test:integration`.",
  );
}
