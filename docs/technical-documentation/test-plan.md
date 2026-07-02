# Test Plan

How we cover the system from unit through e2e, with a 75 % minimum statement / branch coverage gate enforced in CI.

This document is a working plan : it inventories what's there, defines what each layer is responsible for, lists the suites we still need to write, and wires the whole thing into GitHub Actions. Phase-2 should land against the gate, not after it.

## Goals

- **75 % coverage floor** on every workspace package + the `services/web` actions / library code, enforced per-package by vitest's built-in threshold check. CI fails the build if any package drops below.
- **A clear seam between the layers** so we don't end up doing integration work in unit tests (slow) or unit work in e2e (flaky).
- **Run the entire suite from `pnpm test` locally + on GitHub CI** without manual setup beyond `pnpm install` + a one-off Supabase + Mailpit bootstrap that already exists for dev.
- **Phase-2 modules ship with their tests at land-time**, not as a follow-up sprint.

## Non-goals

- 100 % coverage. Every package has a long tail of trivial pass-through code (re-exports, type-only files, generated tRPC routers) that costs more to test than it's worth.
- Visual regression testing. Out of scope for now ; revisit if the design system matures.
- Load / performance testing. Separate effort against staging deploys.

## Test layers

We write tests at four layers ; each owns a different question.

| Layer           | Question                                                                                                                    | Tool                                       | Where the test lives                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| **Unit**        | Does this pure function do the right thing in isolation ?                                                                   | vitest                                     | `<package>/tests/<name>.test.ts`                |
| **Integration** | Do these modules talk to each other correctly when wired through Prisma / tRPC / nodemailer / Supabase ?                    | vitest + testcontainers / sqlite-in-memory | `<package>/tests/integration/<name>.test.ts`    |
| **Component**   | Does this React surface render + behave when given known tRPC + i18n state ?                                                | vitest + Testing Library + msw             | `services/web/tests/components/<name>.test.tsx` |
| **End-to-end**  | Can a real user sign up, sign in, manage their account, and reach admin surfaces in a real browser against a real backend ? | Playwright                                 | `services/web/tests/e2e/<flow>.spec.ts`         |

The four layers compose : a unit test catches arithmetic / parsing / regex bugs cheaply ; integration tests catch wiring + transaction + Prisma-default mistakes ; component tests catch state / loading / a11y issues without booting the whole app ; e2e catches full-stack regressions and routing.

## Tooling

- **Unit + integration + component** : [vitest](https://vitest.dev/) + [@vitest/coverage-v8](https://vitest.dev/guide/coverage.html). Already wired in every package's `package.json`. Coverage uses Node's built-in V8 reporter (no Istanbul instrumentation overhead).
- **Component DOM** : [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/) + [@testing-library/jest-dom](https://github.com/testing-library/jest-dom) + [@testing-library/user-event](https://testing-library.com/docs/user-event/intro/). Mounts components inside vitest's jsdom environment. The shared `<TestIntlProvider>` + `renderWithIntl` helpers live in [services/web/tests/test-utils.tsx](../../services/web/tests/test-utils.tsx) ; every component test imports from there so `useTranslations` finds the real production catalog. tRPC client calls are stubbed per test via `vi.mock("@/lib/trpc", …)` returning the minimal `useQuery` / `useMutation` shape the component touches — see [account-sidebar.test.tsx](../../services/web/tests/components/account-sidebar.test.tsx) for the canonical pattern.
- **tRPC stubs in component tests** : [msw](https://mswjs.io/) intercepts the tRPC HTTP transport with deterministic JSON responses. Avoids spinning up a real Fastify + Postgres for every component test.
- **i18n in component tests** : a tiny `<TestIntlProvider>` wrapper that mounts `NextIntlClientProvider` with the messages JSON loaded from disk. So `t("…")` works ; we never render placeholder keys.
- **DB integration** : [Testcontainers Postgres](https://testcontainers.com/modules/postgresql/) for `@monark/db` + every package that exercises it (rbac, organizations, notifications, users). Each suite creates a fresh container, runs the Prisma migrations, then runs against it. Containers are reused across tests in a single file via vitest's `globalSetup`.
- **SMTP integration** : [smtp-tester](https://www.npmjs.com/package/smtp-tester) — a stub SMTP server we boot inside the test runner. Captures `sendMail` calls so we can assert subject, recipient, body. Faster + more deterministic than running Mailpit + polling its inbox API.
- **e2e** : [Playwright](https://playwright.dev/), already configured. Existing config runs Chromium only ; we add Firefox + WebKit projects and run them in CI on the same job.
- **Coverage thresholds** : per-package vitest config sets `coverage.thresholds.lines / branches / functions / statements: 75`. The `pnpm test` task fails the build the moment any threshold is missed.

## Per-package plan

Inventory of what's there, what's missing, and the target shape.

### `@monark/common`

Errors, event bus, logger, tRPC plumbing.

- **Have** : nothing beyond placeholder.
- **Add** :
  - `errors.test.ts` ; every error class is throwable + the `instanceof` chain works + each has the expected status code mapping.
  - `events.test.ts` ; `emit` + `on` register / fire / unsubscribe correctly ; multiple subscribers see the same event ; failures in one subscriber don't cascade.
  - `logger.test.ts` ; redaction rules strip secrets in nested objects.
  - `trpc.test.ts` ; the `requireAuth` / `requireAdmin` helpers throw the right error class on missing context.
- **Coverage target** : 80 % (small package, easy to cover fully).

### `@monark/branding`

Constants, type-checks, logo asset references.

- **Have** : nothing.
- **Add** :
  - `branding.test.ts` ; required fields are present (`appName`, `supportEmail`, `brandPrimary`, `brandAccent`, `logoSrc`) ; hex colours pass the `#RRGGBB` regex ; the `fromEmail` is a valid RFC 5322 address.
- **Coverage target** : 90 % (single config object).

### `@monark/feature-flags`

Flag registry, scoped resolution.

- **Have** : `flags.test.ts`, `resolve.test.ts`, `placeholder.test.ts`.
- **Add** :
  - `data.test.ts` (integration) ; CRUD against the override table ; uniqueness constraints fire correctly ; deleting a role / org / user nulls the matching scope columns.
  - `is-enabled.test.ts` ; the runtime `isEnabled` walks scoped → role → org → global → registry default in the right order.
- **Coverage target** : 85 %.

### `@monark/db`

Prisma client wrapper. Generated code is excluded from coverage by default.

- **Have** : nothing.
- **Add** :
  - `client.test.ts` ; `getDb` returns a singleton ; the generated `Prisma` types + the `Notification` / `Role` / `Organization` enums survive a round-trip.
- **Coverage target** : 50 % (most code is generated). Special-case threshold exemption.

### `@monark/users`

User CRUD, profile updates, deletion grace.

- **Have** : placeholder.
- **Add** :
  - `data.test.ts` (integration) ; create / find / update / soft-delete round-trips ; the `findById` filter excludes soft-deleted by default ; updating a user emits the right event.
  - `profile.test.ts` ; bio / locale / avatar updates persist correctly ; trimming + length caps + unicode normalisation happen at the data layer.
  - `deletion.test.ts` ; scheduling deletion sets `deletedAt`, an admin cancellation clears it, the 14-day cron `processExpiredDeletions` only catches expired rows.
- **Coverage target** : 80 %.

### `@monark/auth`

Sign-up, sign-in, password rules, TOTP, trusted devices, session lifecycle. The biggest package.

- **Have** : `accept-language.test.ts`, `account-lifecycle.test.ts`, `crypto.test.ts`, `password-rules.test.ts`, `signup-schema.test.ts`, `totp-rate-limit.test.ts`, `trusted-devices-helpers.test.ts`. Strong start.
- **Add** :
  - `totp.test.ts` ; enrolment generates a base32 secret + QR ; confirmation accepts the current code, rejects the previous code, rejects a future one ; recovery codes are 10 unique tokens, each consumable once.
  - `trusted-devices.test.ts` (integration) ; recognising a device upserts the row + emits `trusted-device.added` exactly once on first-seen ; the cookie validates against live rows ; `revokeAll` flips every row's `revokedAt`.
  - `signup.test.ts` (integration) ; full signup → email verification → row state transition. Stubs the Supabase Auth admin client.
  - `email-verification.test.ts` ; OTP path accepts the 6-digit code from the email + idempotently no-ops on a second attempt.
- **Coverage target** : 80 %.

### `@monark/notifications`

Dispatch, prefs, templates, transport, subscribers.

- **Have** : `email.test.ts`, `enrich.test.ts`, `prefs.test.ts`, `registry.test.ts`, `template.test.ts`. Decent coverage of the rendering layer.
- **Add** :
  - **Email shell snapshot test** (already in [backlog](../todo/backlog.md)) ; calls `notify()` with a stubbed mailer, asserts the captured HTML contains no literal `{{` substrings. Catches the whole class of token-substitution regressions.
  - `dispatch.test.ts` (integration) ; an end-to-end `notify()` against a Postgres testcontainer + smtp-tester. Persists the row, fires the SMTP send, marks `deliveredAt`, emits `notification.created`.
  - `prefs.test.ts` extension ; the `requiredEmail` rule overrides any pref row for SECURITY × EMAIL ; resetting a user's prefs deletes every row in one query.
  - `subscribers.test.ts` ; each domain event (`user.password-changed`, `trusted-device.added`, …) fires the matching `notify()` call with the right payload ; idempotent registration (calling `registerNotificationSubscribers` twice doesn't double-bind).
  - `template.test.ts` extension ; locale branching renders the `fr` arm when locale is `fr`, falls back to `en` when locale is null. Unknown vars are left visible (template-author dev affordance).
- **Coverage target** : 80 %.

### `@monark/organizations`

Org CRUD, bootstrap, invites, slug rotation, redirects.

- **Have** : placeholder.
- **Add** :
  - `data.test.ts` (integration) ; CRUD round-trips ; soft-deleted orgs filter out by default ; `findOnlyActiveOrganization` returns null when count !== 1.
  - `bootstrap.test.ts` (integration) ; provisioning the singleton from env vars is idempotent ; running twice is a no-op ; the seeding actor is `system:bootstrap` ; `getCurrentOrg`'s single-tenant fallback resolves correctly.
  - `slug-rotation.test.ts` (integration) ; renaming a slug records an `OrgSlugRedirect` row with a 90-day TTL ; collisions on the new slug throw `ValidationError` cleanly.
  - `invites.test.ts` (integration) ; `createInvite` mints a unique token + persists only the SHA-256 hash ; `acceptInviteByToken` is atomic (membership + role + invite-row stamping) ; `consumePendingInvitesForUser` is idempotent.
- **Coverage target** : 80 %.

### `@monark/rbac`

Roles, permissions, assignments, scoped resolution.

- **Have** : `permissions.test.ts`, `placeholder.test.ts`. Permission registry is solid.
- **Add** :
  - `data.test.ts` (integration) ; `createCustomRole`, `updateRole`, `deleteRole` round-trip + uniqueness constraints fire ; the FK constraint `RoleAssignment.organizationId → Organization.id ON DELETE CASCADE` cleans up assignments when an org is deleted.
  - `read.test.ts` (integration) ; `findActiveAssignments` includes the platform-tier SYSADMIN row regardless of the requested orgId ; `hasPermission` short-circuits to `true` for ADMIN / SYSADMIN regardless of `RolePermission` rows.
  - `guards.test.ts` ; `requireAdmin` / `requireRoleKey` throw `ForbiddenError` when the user lacks the role ; `adminAssignmentSummary` returns the right shape.
  - `write.test.ts` ; `validateRoleKey` rejects reserved keys (`ADMIN`, `SYSADMIN`) + invalid characters ; `createRole` emits the `rbac.role-created` event with the right payload.
- **Coverage target** : 80 %.

## Per-service plan

### `services/api`

Fastify app + tRPC router export + bootstrap + cron endpoint.

- **Have** : nothing.
- **Add** :
  - `server.test.ts` (integration) ; boot the Fastify app against a Postgres testcontainer ; assert the `/healthz` endpoint returns 200 ; tRPC procedures registered on `/trpc` are reachable.
  - `cron.test.ts` (integration) ; `POST /cron/process-account-deletions` requires `Authorization: Bearer $CRON_SECRET` ; with the right token, it sweeps expired rows ; with the wrong token, returns 401.
  - `bootstrap-from-env.test.ts` (integration) ; `INITIAL_ORG_*` env vars provision the singleton on first boot ; second boot against a healthy install is a no-op ; mismatch between env and DB logs a warning instead of erroring.
- **Coverage target** : 70 % (a lot of the api is plumbing ; lower threshold for this service).

### `services/web`

Next.js app. Server actions, client islands, page routes.

The right unit-of-test for a web page is the _server action_ (a pure async function with typed inputs / outputs) and the _interactive island_ (a React component with local state). Pages themselves are mostly composition + auth gates ; e2e covers those.

- **Have** : nothing under `services/web/tests/components/` ; only e2e specs.
- **Add** :
  - **Server actions** ; one suite per `actions.ts` file. Stubs the `@monark/*/server` calls + the Supabase admin client. Covers happy path + every documented error code.
    - `(authed)/account/actions.test.ts` ; `changePasswordAction`, `requestEmailChangeAction`, `verifyEmailChangeOtpAction`, `setLocalePreferenceAction`, `requestAccountDeletionAction`, `cancelAccountDeletionAction`, `uploadAvatarAction`, `uploadBannerAction`.
    - `(authed)/admin/users/admin-actions.test.ts` ; `adminSendPasswordResetAction`, `adminUploadUserAvatarAction`, `adminUploadUserBannerAction`.
    - `(authed)/admin/organizations/actions.test.ts` ; `adminUploadOrgLogoAction`.
    - `(anon)/signin/actions.test.ts` ; `signInAction`, `signOutAction`, post-signin grace-redirect logic.
    - `(anon)/signup/actions.test.ts` ; `signUpAction`, `resendConfirmationAction`.
    - `auth/reset-password/actions.test.ts` ; TOTP gate fires for enrolled users ; missing-code rejects ; wrong-code rejects ; right-code lands the new password.
  - **Client components** ; only the ones with non-trivial state. Skip presentational primitives.
    - `app-bar-breadcrumb.test.tsx` ; renders correctly for static URLs, dynamic ids, the truncation rule, the non-navigable list (`/admin` muted), single-tenant non-navigable additions, mobile single-segment mode.
    - `notifications-bell.test.tsx` ; badge count, drawer open / close, filter tab switching, mark-read / mark-unread / dismiss invalidations, empty state.
    - `app-launcher.test.tsx` ; renders APPS list + the empty-slot card ; external apps open in new tab ; current pill renders.
    - `user-menu.test.tsx` ; banner falls back to the gradient when no banner is set ; "About you" links navigate to the right routes ; logout fires `signOutAction`.
    - `account-sidebar.test.tsx` ; active state matches the pathname ; grace-period filter hides security + notifications tabs.
    - `password-section.test.tsx` ; modal opens / closes, mismatch detection, strength meter integration, TOTP dialog handoff for enrolled users.
    - `email-change-form.test.tsx` ; form → verify stage transition, OTP retry on the other inbox, dialog state persistence across stage flips.
    - `totp-section.test.tsx` ; the 2-step enroll wizard ; the disable + regenerate dialogs ; recovery codes copy ; secret codeblock copy.
    - `role-editor.test.tsx` ; create / edit / delete paths ; tri-state checkboxes (none / some / all) ; permission search auto-expands matching categories ; built-in ADMIN locks the grid.
    - `roles-manager.test.tsx` ; search filter, click-row navigation, "New role" link carries the org id, single- vs multi-tenant org-picker visibility.
    - `users-list.test.tsx` ; search, filter chips clear individually, invite dialog mount, paginated load-more.
- **Coverage target** : 75 % overall ; 80 % on `src/app/(authed)/**/actions.ts` files specifically (those are the security-sensitive surface).

## End-to-end plan

Playwright covers the _user_ paths : we don't try to test every code branch here, just the happy paths and the half-dozen scary failure modes.

### Setup

The CI job spins up :

- A throwaway Supabase local stack (`supabase start`) ; provides Postgres + Auth + Inbucket SMTP.
- The api service (`pnpm --filter api dev`) ; subscribers register at boot.
- The web service (`pnpm --filter web dev`) on port 3000.
- An [Inbucket HTTP client](https://www.inbucket.org/) that polls the SMTP catcher's REST API for outbound emails (so we can pluck verification codes + reset tokens out programmatically).

### Spec coverage

#### Already shipped

- `auth-routing.spec.ts` ; smoke checks that the public auth pages render and the gated routes redirect.
- `signup-happy-path.spec.ts` ; the existing happy-path signup smoke.

#### Add (Phase-1 closure)

- `signup-confirm.spec.ts` ; signup → poll Inbucket → click the confirmation link → land on `/`.
- `signin-totp.spec.ts` ; user with TOTP enrolled goes through the two-step sign-in.
- `forgot-password.spec.ts` ; request reset → poll Inbucket → click link → set new password → sign in with it.
- `email-change.spec.ts` ; change email → both inboxes receive the OTP → confirm with one side → second side prompt → confirm second side → sign-out + redirect.
- `password-change.spec.ts` ; change password from `/account/security` ; without TOTP, with TOTP.
- `totp-lifecycle.spec.ts` ; configure (2-step wizard) → confirm code → save recovery codes → disable → reconfigure → regenerate codes.
- `account-deletion.spec.ts` ; request deletion → see grace-period lockdown → cancel → unlocked.
- `admin-bootstrap.spec.ts` ; first-boot single-tenant : `/setup` redirects → operator hits `/admin/organizations/<singleton>` → fills form.
- `admin-users-invite.spec.ts` ; admin invites a user → recipient signs up via the link → joins with the right role.
- `admin-rbac-create-role.spec.ts` ; admin creates a custom role → assigns it to a user → user shows the role chip in their detail page.

#### Add (Phase-2 ; per module as it ships)

Each Monark-specific module under `phase-2/` ships its own e2e spec at land-time : community, contributions, voting, etc. The pattern is the same — happy path + the scary failure modes.

### Cross-browser

Playwright config currently runs Chromium only. We extend to :

- **Chromium** ; primary.
- **Firefox** ; second-row coverage.
- **WebKit** ; mobile-iOS proxy ; especially the breadcrumb mobile mode + drawer interactions.

Three projects in `playwright.config.ts` ; CI runs them in parallel in the same job. Add `--project=chromium` to the local `test:e2e` script for the inner-loop ; full suite on push.

## Coverage strategy

### Per-package thresholds

Each package's `vitest.config.ts` sets :

```ts
test: {
  coverage: {
    provider: "v8",
    reporter: ["text", "lcov"],
    thresholds: {
      lines: 75,
      branches: 75,
      functions: 75,
      statements: 75,
    },
    exclude: [
      "**/index.ts",        // re-exports only
      "**/*.d.ts",
      "**/contracts/**",    // type-only modules
      "**/types.ts",
      "src/server/data/generated/**", // codegen
    ],
  },
}
```

Special-case overrides :

- `@monark/db` — 50 % overall (most code is generated).
- `services/api` — 70 % overall (a lot of the surface is Fastify plumbing).
- `services/web/src/app/(authed)/**/actions.ts` — 80 % (security-sensitive).

### Aggregated coverage

The CI job uploads each package's `coverage/lcov.info` to [Codecov](https://about.codecov.io/) (or stores it as a build artifact). The repo's coverage badge points at the aggregated number. Phase-2 work should lift the floor over time ; the per-package threshold is the load-bearing gate.

### Local dev

`pnpm test --coverage` from any package prints the threshold report to the terminal. Devs see "lines coverage 73.4 % / threshold 75 %" before pushing — same gate CI uses.

## CI integration

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

The 75 % threshold gate fires inside `pnpm test` itself — if any package drops below, vitest exits non-zero and the job fails.

## Phasing

We don't write all of this in one push. Phase-1 closure is :

1. **Wire vitest's coverage thresholds + reporter** in every existing package config. Existing tests already cover most of `@monark/auth` + `@monark/notifications` ; that gives us a baseline number per package.
2. **Add the email-shell snapshot test** (in [backlog](../todo/backlog.md)) ; closes one open follow-up.
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
- e2e specs stay tied to the user paths in [user-guide/](../user-guide/) ; if the guide gets a new section, the e2e suite gets a new spec.
