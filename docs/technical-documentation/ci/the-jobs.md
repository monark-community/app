# The jobs

All jobs install with `pnpm install --frozen-lockfile` on the Node version in
`.nvmrc`, then run in parallel:

| Job                   | What it runs                                                                                                               | Notes                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **lint-typecheck**    | `pnpm lint`, `pnpm typecheck`                                                                                              | The lightest leg; usually finishes first.                                                                                                                                                                |
| **repo-checks**       | codegen drift (`gen:schema`/`gen:events`/`gen:routers --check`), `check:tiers`, `check:modules`, `check:i18n`, `check:mcp` | Cross-package invariants. Isolated so a stale generated file can't masquerade as a lint/type failure.                                                                                                    |
| **migration-drift**   | `check:migrations`                                                                                                         | Replays every committed migration into a throwaway `postgres:16` service and diffs the result against `schema.prisma`. Catches a modeled change shipped without a migration, or a hand-edited migration. |
| **unit-tests**        | `pnpm test:coverage`                                                                                                       | Uploads each package's `coverage/unit/` as an artifact.                                                                                                                                                  |
| **integration-tests** | `pnpm test:integration:coverage`                                                                                           | The slow leg (~3–4 min); each package boots a Postgres testcontainer in `globalSetup`. Uploads `coverage/integration/`.                                                                                  |
| **coverage-upload**   | `pnpm coverage:merge` → Codecov                                                                                            | `needs: [unit-tests, integration-tests]`. Fuses the two coverage sets per package, **enforces the per-package floors** (below), then uploads to Codecov.                                                 |

The codegen-drift check compares the committed generated files to a fresh
re-render **EOL-insensitively** (a Windows-committed CRLF artifact vs the Linux
runner's LF render is not real drift); `pnpm gen:schema` also normalizes source
line endings to LF on read so its output is byte-identical across platforms.
