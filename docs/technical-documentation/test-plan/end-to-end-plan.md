# End-to-end plan

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
- `signup-happy-path.spec.ts` ; the happy-path signup smoke.
- `signin-happy-path.spec.ts` ; the happy-path sign-in smoke.
- `signup-confirm.spec.ts` ; signup → poll Inbucket → click the confirmation link → land on `/`.
- `forgot-password.spec.ts` ; request reset → poll Inbucket → click link → set new password → sign in with it.
- `password-change.spec.ts` ; change password from `/account/security` ; without TOTP, with TOTP.
- `account-deletion.spec.ts` ; request deletion → see grace-period lockdown → cancel → unlocked.
- `admin-users-invite.spec.ts` ; admin invites a user → recipient signs up via the link → joins with the right role.
- `admin-rbac-create-role.spec.ts` ; admin creates a custom role → assigns it to a user → user shows the role chip in their detail page.
- `admin-webhooks.spec.ts` ; create an endpoint → trigger a subscribed event → the delivery lands with a signature.
- `a11y.spec.ts` ; axe sweep (`@axe-core/playwright`) over the main surfaces. Runs with the rest of `pnpm test:e2e`, or on its own with `pnpm --filter web test:e2e tests/e2e/a11y.spec.ts`.

#### Still to add (Phase-1 closure)

- `signin-totp.spec.ts` ; user with TOTP enrolled goes through the two-step sign-in.
- `email-change.spec.ts` ; change email → both inboxes receive the OTP → confirm with one side → second side prompt → confirm second side → sign-out + redirect.
- `totp-lifecycle.spec.ts` ; configure (2-step wizard) → confirm code → save recovery codes → disable → reconfigure → regenerate codes.
- `admin-bootstrap.spec.ts` ; first-boot single-tenant : the api provisions the singleton from `INITIAL_ORG_*` → operator hits `/admin/organizations/<singleton>` → fills in the rest of the profile.

#### Add (Phase-2 ; per module as it ships)

Each extended module ships its own e2e spec at land-time (`calendar` and `kanban` today ; future community / voting / contribution modules the same). The pattern is the same ; happy path + the scary failure modes.

### Cross-browser

Playwright config currently runs Chromium only. We extend to :

- **Chromium** ; primary.
- **Firefox** ; second-row coverage.
- **WebKit** ; mobile-iOS proxy ; especially the breadcrumb mobile mode + drawer interactions.

Three projects in `playwright.config.ts` ; CI runs them in parallel in the same job. Add `--project=chromium` to the local `test:e2e` script for the inner-loop ; full suite on push.
