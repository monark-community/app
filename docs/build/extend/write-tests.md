---
type: how-to
---

# Write tests

Add the tests a change needs, at the right layer, and keep the package above its coverage floor. [Test layers](../../reference/test-layers.md) lists what each layer is for and where it lives.

## Add a unit test

1. Create `tests/<thing>.test.ts` in the package. Keep it free of the database and the network; stub collaborators.
2. Run it:
   ```sh
   pnpm --filter <package> test
   ```

## Add an integration test

Use this for anything that reads or writes the database. Docker must be running.

1. If the package has no `vitest.integration.config.ts`, copy `packages/calendar/vitest.integration.config.ts`, add `@monark/test-utils` as a dev dependency, and add the scripts to the package's `package.json`:
   ```json
   "test:integration": "vitest run --config vitest.integration.config.ts --passWithNoTests",
   "test:integration:coverage": "vitest run --config vitest.integration.config.ts --coverage --passWithNoTests"
   ```
2. Create `tests/integration/<thing>.test.ts`. Clear the tables you touch before each test:
   ```ts
   import { getDb } from "@monark/db";
   import { truncate } from "@monark/test-utils/db";

   beforeEach(async () => {
     await truncate(getDb(), ["Post"]);
   });
   ```
3. Run it:
   ```sh
   pnpm --filter <package> test:integration
   ```
   Each run starts a fresh Postgres container and applies every migration first.

## Keep coverage above the floor

1. Run both layers with coverage, then merge:
   ```sh
   pnpm --filter <package> test:coverage
   pnpm --filter <package> test:integration:coverage
   pnpm coverage:merge
   ```
2. For a new package, add a floor for it to `THRESHOLDS` in `tools/merge-coverage.ts`. `pnpm coverage:suggest` prints one based on your run.

Good to know:

- Run integration specs only through their config. From an IDE without it, a guard stops the run so it can't write to your development database.
- Don't mock the database; a real container catches query mistakes a mock hides.
- Don't lower a floor to get a green build. Add the missing tests, or explain the change in the pull request.

Next: [Add a search source](add-a-search-source.md)
