# Test Plan

How we cover the system from unit through e2e, with a 75 % minimum statement / branch coverage gate enforced in CI.

This document is a working plan : it inventories what's there, defines what each layer is responsible for, lists the suites we still need to write, and wires the whole thing into GitHub Actions. New modules should land against the gate, not after it.

> **Status: forward-looking plan, partly realized.** The layer seams + the 75 % coverage gate are in force. The per-package "what exists today" inventory further down predates most of the shipped modules and their test suites ; for what's actually tested now, read each module's `README.md` and [platform-overview.md](../platform-overview/_index.md). References below to `phase-2/` feature modules (community, contributions, voting) are original examples ; the extended modules that actually shipped are `calendar` and `kanban`.

## In this section

- **[Test layers](test-layers.md)**
- **[Tooling](tooling.md)**
- **[Per-package plan](per-package-plan/_index.md)**
- **[Per-service plan](per-service-plan.md)**
- **[End-to-end plan](end-to-end-plan.md)**
- **[Coverage strategy](coverage-strategy.md)**
- **[CI integration](ci-integration.md)**

## Goals

- **75 % coverage floor** on every workspace package + the `services/web` actions / library code, enforced per-package by vitest's built-in threshold check. CI fails the build if any package drops below.
- **A clear seam between the layers** so we don't end up doing integration work in unit tests (slow) or unit work in e2e (flaky).
- **Run the entire suite from `pnpm test` locally + on GitHub CI** without manual setup beyond `pnpm install` + a one-off Supabase + Mailpit bootstrap that already exists for dev.
- **Phase-2 modules ship with their tests at land-time**, not as a follow-up sprint.


## Non-goals

- 100 % coverage. Every package has a long tail of trivial pass-through code (re-exports, type-only files, generated tRPC routers) that costs more to test than it's worth.
- Visual regression testing. Out of scope for now ; revisit if the design system matures.
- Load / performance testing. Separate effort against staging deploys.


## Phasing

We don't write all of this in one push. Phase-1 closure is :

1. **Wire vitest's coverage thresholds + reporter** in every existing package config. Existing tests already cover most of `@monark/auth` + `@monark/notifications` ; that gives us a baseline number per package.
2. **Add the email-shell snapshot test** (in [backlog](../../todo/backlog.md)) ; closes one open follow-up.
3. **Fill the missing-tests gaps in `@monark/users`, `@monark/organizations`, `@monark/rbac`** to clear the 75 % bar. Most of these are integration tests against a Postgres testcontainer.
4. **Add the server-action test suites** (`services/web/src/app/.../actions.ts`) ; the security-sensitive surface gets covered first.
5. **Add the e2e spec list above** ; the bootstrap + signup + signin + admin-invite specs go first, the rest follow as Phase-2 work touches them.
6. **Add component tests** as the surfaces stabilise ; we don't want to retest behavior that's about to change.

Phase-2 modules ship with their unit + integration + component + e2e tests at land-time. The CI gate makes this non-optional.


## Anti-patterns to avoid

- **Mocking Prisma** ; the schema + the queries are the actual source of truth. A unit test that mocks `db.user.findUnique` doesn't catch the `where: { id, deletedAt: null }` filter. Always use a real DB (testcontainers).
- **Mocking time without locking it** ; vitest's `vi.useFakeTimers()` is the right path. Don't mock `Date.now()` directly.
- **Shared state between tests** ; every integration test starts from a clean DB. The testcontainer is fresh per file ; within a file, each `beforeEach` truncates the affected tables.
- **Snapshot tests for HTML / JSX** ; use specific assertions (`toBeInTheDocument`, `toHaveAttribute`) instead. Snapshots rot fast and most diffs are noise.
- **Inflating coverage with trivial getters** ; the threshold is a floor, not a ceiling. Don't write tests that only exist to pad coverage.
- **e2e tests that depend on each other** ; every spec file should be independently runnable. The `signup-confirm` spec creates its own user ; the `email-change` spec doesn't reuse it.


## Maintenance

- The CHANGELOG records new test suites the same way it records features.
- The backlog tracks "tests we know we need but haven't written" ; the email-shell snapshot is the existing example.
- Coverage thresholds tighten over time : we land at 75 %, aim for 80 % by phase-2 close, 85 % by phase-3.
- e2e specs stay tied to the user paths in [user-guide/](../../user-guide/) ; if the guide gets a new section, the e2e suite gets a new spec.
