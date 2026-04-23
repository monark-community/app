# Phase 1 — Implementation order

## Goal

All five core modules live and integrated. A new user can sign up, verify their email, enable TOTP, and sign in with role-based routing applied. Phase 1 is done when the full auth + org + rbac stack is a hand-off-able foundation for Phase 2.

## Order

1. **[`feature-flags.md`](feature-flags.md)**
   Pure infrastructure; zero module deps; every other module gates rollouts through it. Ship first so Phase 1's in-progress work can hide behind flags.

2. **[`user-management.md`](user-management.md)**
   The `User` table anchors auth, organizations, and rbac. Ship the schema + `getById` / `getCurrentUser` read interface first; profile-edit procedures can fill in once auth exists to populate rows.

3. **[`organization-management.md`](organization-management.md)**
   Users belong to orgs; the `org_id` claim is baked into the session Supabase issues. Must exist before rbac can scope roles.

4. **[`rbac-system.md`](rbac-system.md)**
   Role resolution is a function of `(user, org)`; can't exist until both are present. Exposes `hasRole` / `requireRole` read interfaces that every later module will use.

5. **[`auth-login-password.md`](auth-login-password.md)**
   Supabase-backed sign-up / sign-in. Creates the `User` row on signup via step 2's write interface; resolves `org_id` via step 3's default-org rule; stamps the session's role claim via step 4.

6. **[`auth-password-strength.md`](auth-password-strength.md)**
   Policy layer attached to signup + reset flows. Cheap to bolt on once step 5 is stable.

7. **[`auth-email-validation.md`](auth-email-validation.md)**
   Token flow that gates the "full session" issuance. Lives in the sign-up path defined in step 5.

8. **[`auth-trusted-devices.md`](auth-trusted-devices.md)**
   Device fingerprint + recognition; skipped on recognized devices. Consumed by TOTP next.

9. **[`auth-totp.md`](auth-totp.md)**
   Second factor; skips on recognized devices per step 8's policy. Last to ship because it depends on the most upstream work and is the feature most users will see last.

## Exit criteria

- A new user signs up → verifies email → enables TOTP → signs out → signs back in from a trusted device (TOTP skipped) → signs in from an unknown device (TOTP required).
- An admin is soft-walled out of `/admin/**` on day 1 without TOTP enrolled, and hard-walled out after 7 days.
- Every auth sub-feature is gated behind a feature flag so rollbacks are a flag flip, not a deploy.
- `pnpm check:tiers` passes; every core module declares only core-tier or infrastructure dependencies.
- Phase 2 can start; the read interfaces it depends on (`users.getById`, `rbac.hasRole`, etc.) are frozen and typed.

## Parallelization

- Steps 2 and 3 can partially overlap once step 1 is live: the `User` and `Organization` schemas don't conflict, only the membership join table does. Build both schemas, then land the join model as part of step 3.
- Steps 6, 7, 8 can ship in parallel once step 5 is stable; they each layer onto different points in the auth flow and don't cross-depend.
- Step 9 must strictly follow step 8.

## Sequencing risks

- **Auth before users is tempting** because "auth is the first thing a user sees." Don't. Auth writes to the user table, so user-management's schema has to exist first, even if profile edits don't.
- **RBAC before orgs is tempting** because "roles are simple." Don't. Every role in this product is scoped by `(user, org)`; without orgs, RBAC ships with a placeholder scope that gets rewritten later.
- **TOTP before trusted-devices is tempting** because TOTP is the headline feature. Don't. The trusted-device skip policy is part of TOTP's UX contract; implementing TOTP without it produces a worse first version that users will feel.
