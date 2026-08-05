/**
 * Turns a set of feature flags ON for a **dev instance** by writing a GLOBAL
 * override for each — the flag's registered `defaultOn` stays `false`, so this
 * changes nothing for production deploys ; it only flips the flags on in the
 * database this script points at (the same thing an operator would do by hand at
 * `/admin/feature-flags`, scripted + idempotent).
 *
 * The flags enabled here (all `defaultOn: false` upstream) :
 *   - `data-models.query-language`   — MonarkQL query bar on the record list
 *   - `public-api.enabled`           — the /api/v1 public REST surface
 *   - `public-api.service-accounts`  — org service accounts + their API keys
 *   - `chat.enabled`                 — the Chat module (conversations UI + substrate)
 *   - `chat.ai-agent`                — the app-owned AI assistant inside chat
 *
 * Idempotent : re-running upserts the same global overrides. Refuses to run with
 * `NODE_ENV=production` (flip production flags via the admin UI, deliberately).
 *
 * Usage :
 *   pnpm enable:dev-flags
 *   # or directly :
 *   pnpm tsx --env-file=services/api/.env tools/enable-dev-flags.ts
 *
 * Required env :
 *   - DATABASE_URL / DIRECT_URL — Prisma points here (the dev instance's DB).
 */

import { getDb } from "@monark/db";
import { registerChatFeatureFlags } from "@monark/chat/server";
import { registerDataModelsFeatureFlags } from "@monark/data-models/server";
import { registerPublicApiFeatureFlags } from "@monark/public-api/server";
import { setOverride, syncFlagsToDatabase } from "@monark/feature-flags/server";

const DEV_FLAGS = [
  "data-models.query-language",
  "public-api.enabled",
  "public-api.service-accounts",
  "chat.enabled",
  "chat.ai-agent",
] as const;

// Audit-trail marker on the override row. `FeatureFlagOverride.setById` is a
// plain string (not a User FK), so a system sentinel is fine here.
const ACTOR = "system:enable-dev-flags";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "enable-dev-flags : refusing to run with NODE_ENV=production. This tool is dev-only ; " +
        "flip flags in production deliberately via /admin/feature-flags.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "enable-dev-flags : missing DATABASE_URL. Run via `pnpm enable:dev-flags` (which passes " +
        "--env-file=services/api/.env).",
    );
  }

  // Populate the in-memory flag registry for the two owning modules, then sync
  // the definitions to the DB so each override's FK (module,flagKey →
  // FeatureFlag) resolves even on a freshly-migrated database.
  registerChatFeatureFlags();
  registerDataModelsFeatureFlags();
  registerPublicApiFeatureFlags();
  await syncFlagsToDatabase();

  for (const key of DEV_FLAGS) {
    await setOverride(
      key,
      {},
      true,
      ACTOR,
      "Enabled for the dev instance via tools/enable-dev-flags.ts",
    );
    console.log(`  ↳ global override ON : ${key}`);
  }

  console.log(
    "enable-dev-flags : done. These flags now resolve ON for this instance (registered defaults unchanged).",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  })
  .finally(async () => {
    // Close the pool so the script exits promptly.
    await getDb().$disconnect();
  });
