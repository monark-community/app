# Test plan (open items)

What's left of the original test plan once shipped practice moved to the published docs ([Write tests](../build/extend/write-tests.md), [Test layers](../reference/test-layers.md)). The old plan's flat 75 % per-package vitest threshold, Codecov upload and per-package inventories are superseded by the per-package floors in `tools/merge-coverage.ts` and each module's README.

## End-to-end specs not yet written

- `signin-totp.spec.ts`: a user with TOTP enrolled goes through the two-step sign-in.
- `email-change.spec.ts`: change email, both inboxes get the OTP, confirm both sides, sign-out and redirect.
- `totp-lifecycle.spec.ts`: enrol (2-step wizard), confirm, save recovery codes, disable, re-enrol, regenerate codes.
- `admin-bootstrap.spec.ts`: first boot provisions the singleton org from `INITIAL_ORG_*`; operator completes its profile.
- One spec per extended module (calendar, kanban, wiki, …): happy path plus the risky failure modes.

## Cross-browser

Playwright runs Chromium only. Plan: add Firefox and WebKit projects (WebKit as the iOS proxy for the mobile breadcrumb and drawer), run all three in CI, keep `--project=chromium` for the local inner loop.

## Server-action and component suites

Server actions (`services/web/src/app/**/actions.ts`) have no dedicated suites yet. Candidates: account actions (password, email change, locale, deletion, avatar/banner upload), admin user and org actions, sign-in / sign-up actions, and the reset-password TOTP gate. Component suites worth adding for stateful surfaces: notifications bell, user menu, password section, email-change form, TOTP section, role editor, roles manager, users list.

## api service

Integration coverage for the cron endpoints (bearer `CRON_SECRET` accepted / rejected, sweep behaviour) and for first-boot provisioning from `INITIAL_ORG_*` (idempotent second boot, env/DB mismatch warns instead of failing).

## Coverage direction

Floors are a ratchet: raise each package's floor as tests land; never lower one to pass CI without saying why in the PR.

## Anti-patterns (keep enforcing in review)

- Mocking Prisma instead of using the testcontainer.
- Mocking `Date.now()` directly instead of `vi.useFakeTimers()`.
- State shared between tests or e2e specs that depend on each other.
- HTML / JSX snapshot tests in place of specific assertions.
- Tests that exist only to pad coverage.
