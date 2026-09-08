# Test

| Command                                                                         | Runs                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm test`                                                                     | Unit tests across every package.                                                                             |
| `pnpm test:integration`                                                         | Integration tests (serialized ; each boots a throwaway Postgres testcontainer ; **Docker must be running**). |
| `pnpm test:e2e`                                                                 | Playwright end-to-end (full stack : Supabase + api + web).                                                   |
| `pnpm test:coverage` / `pnpm test:integration:coverage` → `pnpm coverage:merge` | Coverage, fused and checked against the per-package floors.                                                  |

Run a single package's integration suite with `pnpm --filter <pkg> test:integration` (e.g. `pnpm --filter @monark/calendar test:integration`). Integration and e2e suites only run when Docker (and, for e2e, the full stack) is available. See [testing](../../agents/testing.md) for how the harness works and how to add a test.
