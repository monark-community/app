# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

No versioned releases have been cut yet. The app is pre-release; this file will grow as milestones land. Entries are dated; each is one concise line describing a feature, foundation shift, or substantive fix.

## [Unreleased]

- 2026-04-24: Added email-verification to `@monark/auth`; `signUpUser` switched to Supabase's public `auth.signUp` so a confirmation email is emitted (Mailpit locally), new `/auth/confirm` route handler exchanges the OTP and flips `User.emailVerifiedAt`, `/signup/check-email` waiting page with resend button (5/hour per-user cap via `EmailResendAttempt`), `requireVerifiedEmail(ctx)` guard, `EmailVerifiedEvent` emitted on successful confirm. Password reset, invite bypass, and the `auth.require-verified-email` soft-gate flag deferred.
- 2026-04-24: Added password-strength rules to `@monark/auth`; `checkPasswordOffline` enforces length ≥ 12 + 3+ character classes + no email/display-name substrings, `checkPassword` adds HIBP k-anonymity (degrades open on upstream failure), signup form renders live per-rule checkmarks, `signUpUser` rejects before the Supabase admin call, new `auth.checkPassword` tRPC mutation for blur-time feedback. zxcvbn score + shadcn `PasswordInput` primitive deferred.
- 2026-04-24: Added auth-login-password MVP (`@monark/auth` + Supabase integration); `signUpUser` orchestrator with compensating auth/DB rollback, `signIn`/`signOut` server actions in web, `auth.ping` + `auth.session` tRPC queries, Supabase SSR cookie helpers + middleware for session refresh, api-side token verification populating `ctx.userId` and `ctx.activeOrganizationId` via `supabase.auth.getUser(token)`, `@monark/auth`-owned `UserSignedUpEvent`/`UserSignedInEvent`/`UserSignedOutEvent`/`PasswordChangedEvent`, minimal `/signup` and `/signin` pages. Password reset, email-verification UX, TOTP challenge, referral wiring, and full auth-aesthetics styling deferred.
- 2026-04-24: Dev overlay gained an "auth" actions panel (sign up / sign in links + sign-out button).
- 2026-04-24: Added rbac (`@monark/rbac`); canonical `Role` Prisma enum (MONARK_ADMIN, ADMIN, DEVELOPER, AMBASSADOR, STUDENT), `RoleAssignment` table, `PERMISSIONS` matrix + `Permission` type, read-interface (`hasRole`, `hasPermission`, `getUserRoles`, `primaryRole`, `isLastAdmin`), guards (`requireRole`, `requirePermission`), write path (`assignRole`, `revokeRole`) emitting `rbac.role-assigned` / `rbac.role-revoked`, three `rbac.*` tRPC queries (`myRoles`, `myPrimaryRole`, `myPermissions`). Migration also flipped `Invite.role` and `FeatureFlagOverride.role` from `String` to the enum. Admin role-management UI deferred until auth lands.
- 2026-04-24: Dev overlay gained an "rbac" panel pulling current roles + resolved permissions.
- 2026-04-24: Added organization-management MVP (`@monark/organizations`); `Organization`, `OrganizationMembership`, `Invite`, `OrgSlugRedirect` Prisma models + User back-refs, read-interface (`getById`, `getBySlug`, `getUserOrgs`, `getCurrentOrg`, `requireOrg`), `organizations.current` + `organizations.mine` tRPC queries, five lifecycle event types. CRUD, invites, switcher, and white-label deferred until auth + rbac land.
- 2026-04-24: Added `activeOrganizationId` to `TrpcContext`; null until auth wires the session claim.
- 2026-04-24: Dev overlay gained a "current org" panel pulling `trpc.organizations.current` + `trpc.organizations.mine`.
- 2026-04-24: Added user-management MVP (`@monark/users`); `User` + `PendingEmailChange` Prisma models, read-interface (`getById`, `getByIdOrThrow`, `getByEmail`, `getCurrent`), `users.me` tRPC query, `UserProfileUpdatedEvent` type. Profile-edit, admin ops, account deletion, and avatar upload deferred until auth + rbac land.
- 2026-04-24: Dev overlay gained a "current user" panel pulling `trpc.users.me`.
- 2026-04-23: Added feature flags (`@monark/feature-flags`); in-code flag definitions + DB overrides scoped by global/org/user/role, tRPC router, React hooks + `FlagsProvider`, audit event on flip.
- 2026-04-23: Added togglable dev overlay (Alt+D) with API health + feature-flag smoke-test panels; production-stripped.
- 2026-04-23: Switched the codebase to extensionless TypeScript relative imports (`moduleResolution: "Bundler"`), eliminating repeated Next-bundler breakage around `.js` suffixes.
- 2026-04-22: Phase 0 foundation shipped; pnpm + Turborepo monorepo, strict TS base config, Express 5 + tRPC 11 api, Next App Router web, module manifest with tier check, three codegen tools (`gen:module`, `gen:events`, `gen:routers`), CI workflow.
- 2026-04-21: Feature planning specs for Phases 0–3 under `docs/features-planning/` (auth family, RBAC, organizations, users, onboarding, referral, voting, contribution-estimation, auth-aesthetics).

[Unreleased]: https://github.com/monark-community/app/commits/main
