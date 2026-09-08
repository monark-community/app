# Continuous integration

The verify pipeline lives in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
It runs the same gate a developer runs locally before a PR (see the **Pre-PR gate**
in [development.md](development.md)), split across parallel jobs so wall-clock is
the slowest leg rather than the sum of every step.

## When it runs

```yaml
on:
  push: { branches: [main, develop] }
  pull_request: { branches: [main, develop] }
```

`develop` is the working branch and `main` is the release branch; **both are
gated**, on direct pushes and on PRs targeting them. A `concurrency` group keyed
on the ref cancels an in-progress run when a newer commit lands on the same
branch, so only the tip is ever verified.

## The jobs

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

## The coverage-floor gate

`coverage-upload` fails the build if any package drops below its floor, so a
regression in a tested package breaks CI rather than silently eroding coverage.
The floors live in [`tools/merge-coverage.ts`](../../tools/merge-coverage.ts) as
`THRESHOLDS`, one entry per package `{ lines, statements, functions, branches }`.

Two rules the gate enforces:

- **Every package that emits coverage MUST have an entry.** A package that
  produces a coverage report but has no floor fails the gate ("produced coverage
  but has no THRESHOLDS entry") — this is how a newly-added module can't ship
  un-gated. A package with **no** `test:coverage` script produces no report and
  is listed as "skipped" (e.g. pure libraries covered only via their consumers).
- **Floors are a regression guard, not a brag.** Set each metric a few points
  below the measured baseline (round down to the nearest 5 %). Ratchet a floor
  up when new tests justify it; only lower one as a conscious decision, with a
  comment saying why.

When you add a module with tests, add its floor in the same PR. For a module
whose real coverage comes mostly from an **integration** suite (a router /
webhook), a floor set off the unit-only number is a safe lower bound (merged ≥
unit); ratchet it up once a merged CI run publishes the real number.

## End-to-end tests are manual

The Playwright e2e suite ([`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml))
is **`workflow_dispatch` only** — it boots a full Supabase + api + web stack and
costs ~20 min, too much to pay on every push for what is primarily an
auth/admin regression net. Run it from the Actions tab (**Actions → E2E → Run
workflow → pick a branch**) when touching those surfaces; developers run
`pnpm test:e2e` locally otherwise.

## Other workflows

Alongside the verify pipeline, security + quality workflows run on push/PR:

- **gitleaks** — secret scanning (allowlist in `.gitleaks.toml`).
- **codeql** — static analysis.
- **dependency-review** — flags risky dependency changes on PRs.
- **lighthouse** — web performance/accessibility budget.

## Publishing the docs

The user guide, each extended module's user guide, and the technical documentation
are published as a website from a separate repository,
[monark-community/app-docs](https://github.com/monark-community/app-docs). That repo
owns the presentation ; this one owns the prose. Its sync job reads the Markdown out
of a checkout of this repo, converts it to MDX, and opens a PR against itself when the
result differs.

[notify-docs.yml](../../.github/workflows/notify-docs.yml) is this side of that seam:
a push to `develop` touching `docs/user-guide/**`, `docs/technical-documentation/**`,
or `packages/*/docs/**` fires a `repository_dispatch` at the docs site so it syncs
within a minute or so. It is an **optimisation, not a dependency** ; the site also
syncs on a daily schedule, so if the credential below is missing or lapses, the docs
still land, just later. The workflow skips itself (with a notice, not a failure) when
the secrets aren't set.

The dispatch needs a GitHub App token scoped to `app-docs` with **Contents: read &
write** there: `DOCS_SYNC_APP_ID` + `DOCS_SYNC_APP_PRIVATE_KEY`. The App has to be
installed on `monark-community/app-docs` as well as here. This mirrors the
[changelog workflow](../../.github/workflows/changelog-compile.yml)'s reasoning: an
App token can be scoped to exactly one repository, which the built-in `GITHUB_TOKEN`
(scoped to this repo) can't cross to at all.

Prose that isn't published — planning specs, the archive, `docs/agents` — doesn't
trigger anything. A link from a published page into that material is rewritten to an
absolute GitHub URL by the sync, so it stays reachable without being republished.

## Relationship to the local gate

CI is the enforcement copy of the local pre-PR gate:

```
pnpm gen && pnpm typecheck && pnpm lint && pnpm test && \
  pnpm check:tiers && pnpm check:modules && pnpm check:i18n && pnpm check:mcp
```

Run that (plus `pnpm test:integration` and `pnpm coverage:merge` if you touched
tested code) before pushing, and CI should be green on the first try. The one
gap the local gate can't fully reproduce is the **merged** coverage number
(unit + integration), which only `coverage-upload` computes.
