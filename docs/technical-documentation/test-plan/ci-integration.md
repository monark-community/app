# CI integration

The existing `.github/workflows/ci.yml` runs `lint` → `typecheck` → `test`. We extend :

```yaml
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      # … existing steps …
      - name: Run unit + integration tests with coverage
        run: pnpm test -- --coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./packages/*/coverage/lcov.info,./services/*/coverage/lcov.info

  e2e:
    runs-on: ubuntu-latest
    needs: verify
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec supabase start
      - run: pnpm --filter api dev &
      - run: pnpm --filter web build
      - run: pnpm --filter web start &
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - run: pnpm test:e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: services/web/playwright-report
```

Two separate jobs : `verify` (lint / typecheck / unit + integration) is fast (~3 min) and gates the merge ; `e2e` is slower (~10 min) and runs in parallel after `verify` passes.

The 75 % threshold gate fires inside `pnpm test` itself : if any package drops below, vitest exits non-zero and the job fails.
