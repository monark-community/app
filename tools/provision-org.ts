/**
 * Provision the singleton organization for a single-tenant deployment — the
 * operator's manual / repeatable path for first-boot.
 *
 * The API also provisions this at boot from the same `INITIAL_ORG_*` env (see
 * `maybeBootstrapSingletonOrg` in services/api/src/server.ts) ; this CLI exists
 * so an operator can provision (or re-provision) without restarting the API,
 * or drive it from a deploy hook / one-off job.
 *
 * Idempotent : a re-run on a healthy install is a no-op (the existing org id is
 * returned).
 *
 * Usage :
 *   # local, against the `pnpm dev` stack :
 *   pnpm tsx --env-file=services/api/.env tools/provision-org.ts --slug acme --name "Acme Inc"
 *   # production (env already in process.env) :
 *   pnpm provision:org           # reads INITIAL_ORG_SLUG / _NAME / _PRIMARY_COLOR
 *
 * Flags override env : --slug, --name, --color (hex). Fall back to
 * INITIAL_ORG_SLUG / INITIAL_ORG_NAME / INITIAL_ORG_PRIMARY_COLOR.
 *
 * Required env : DATABASE_URL / DIRECT_URL (Prisma).
 */

import { getDb } from "@monark/db";
import { ensureSingletonOrganizationFromInput } from "@monark/organizations/server";

/** Read `--name value` or `--name=value` from argv. */
function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const eq = process.argv.find((a) => a.startsWith(prefix));
  if (eq) return eq.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) {
    const next = process.argv[idx + 1];
    if (next && !next.startsWith("--")) return next;
  }
  return undefined;
}

const FAILURE_HELP: Record<string, string> = {
  "already-bootstrapped": "the system is already bootstrapped.",
  "env-not-set": "provide --slug and --name (or set INITIAL_ORG_SLUG / INITIAL_ORG_NAME).",
  "invalid-slug": "slug must be lowercase alphanumeric + hyphens, 2–60 chars.",
  "invalid-color": "color must be a hex value like #2563EB.",
  internal: "unexpected error.",
};

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "provision-org : DATABASE_URL is not set. Run with `--env-file=services/api/.env` locally, or ensure the deploy env is present.",
    );
  }

  const slug = arg("slug") ?? process.env.INITIAL_ORG_SLUG ?? null;
  const displayName = arg("name") ?? process.env.INITIAL_ORG_NAME ?? null;
  const primaryColor = arg("color") ?? process.env.INITIAL_ORG_PRIMARY_COLOR ?? null;

  const result = await ensureSingletonOrganizationFromInput({
    slug,
    displayName,
    primaryColor,
    actorId: "system:provision-cli",
  });

  if (result.ok) {
    console.log(
      result.created
        ? `provision-org : created singleton organization "${displayName}" (${slug}) — id ${result.organizationId}.`
        : `provision-org : singleton organization already exists — id ${result.organizationId}, nothing to do.`,
    );
    return;
  }

  const detail = "detail" in result && result.detail ? ` (${result.detail})` : "";
  console.error(`provision-org failed : ${FAILURE_HELP[result.reason] ?? result.reason}${detail}`);
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Close the Prisma pool so the script exits promptly.
    await getDb().$disconnect();
  });
