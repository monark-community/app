import { startTestDb, stopTestDb, type StartedDb } from "./db";

/**
 * Vitest `globalSetup` entrypoint. Runs once at the start of a test
 * process, before any test file imports anything. Boots the
 * Postgres testcontainer + applies migrations + writes the
 * connection string to `process.env.DATABASE_URL` so the
 * `@monark/db` Prisma client picks it up on first call.
 *
 * Returns a teardown closure that stops the container on suite end.
 *
 * Usage : add to a per-package `vitest.integration.config.ts` :
 *
 *   import { defineConfig } from "vitest/config"
 *   import baseConfig from "../../vitest.shared"
 *
 *   export default defineConfig({
 *     ...baseConfig,
 *     test: {
 *       ...baseConfig.test,
 *       globalSetup: ["@monark/test-utils/global-setup"],
 *       include: ["tests/integration/**\/*.test.ts"],
 *     },
 *   })
 */
let started: StartedDb | undefined;

export default async function setup(): Promise<() => Promise<void>> {
  started = await startTestDb();
  return async () => {
    if (started) {
      await stopTestDb(started);
      started = undefined;
    }
  };
}
