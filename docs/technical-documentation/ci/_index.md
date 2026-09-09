# Continuous integration

The verify pipeline lives in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml).
It runs the same gate a developer runs locally before a PR (see the **Pre-PR gate**
in [development.md](../development/_index.md)), split across parallel jobs so wall-clock is
the slowest leg rather than the sum of every step.

## In this section

- **[The jobs](the-jobs.md)**
- **[The coverage-floor gate](the-coverage-floor-gate.md)**
- **[Publishing the docs](publishing-the-docs.md)**

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


## End-to-end tests are manual

The Playwright e2e suite ([`.github/workflows/e2e.yml`](../../../.github/workflows/e2e.yml))
is **`workflow_dispatch` only** : it boots a full Supabase + api + web stack and
costs ~20 min, too much to pay on every push for what is primarily an
auth/admin regression net. Run it from the Actions tab (**Actions → E2E → Run
workflow → pick a branch**) when touching those surfaces; developers run
`pnpm test:e2e` locally otherwise.


## Other workflows

Alongside the verify pipeline, security + quality workflows run on push/PR:

- **gitleaks** : secret scanning (allowlist in `.gitleaks.toml`).
- **codeql** : static analysis.
- **dependency-review** : flags risky dependency changes on PRs.
- **lighthouse** : web performance/accessibility budget.


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
