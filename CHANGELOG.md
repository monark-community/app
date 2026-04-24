# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

No versioned releases have been cut yet. The app is pre-release; this file will grow as milestones land. Entries are dated; each is one concise line describing a feature, foundation shift, or substantive fix.

## [Unreleased]

- 2026-04-23: Added feature flags (`@monark/feature-flags`); in-code flag definitions + DB overrides scoped by global/org/user/role, tRPC router, React hooks + `FlagsProvider`, audit event on flip.
- 2026-04-23: Added togglable dev overlay (Alt+D) with API health + feature-flag smoke-test panels; production-stripped.
- 2026-04-23: Switched the codebase to extensionless TypeScript relative imports (`moduleResolution: "Bundler"`), eliminating repeated Next-bundler breakage around `.js` suffixes.
- 2026-04-22: Phase 0 foundation shipped; pnpm + Turborepo monorepo, strict TS base config, Express 5 + tRPC 11 api, Next App Router web, module manifest with tier check, three codegen tools (`gen:module`, `gen:events`, `gen:routers`), CI workflow.
- 2026-04-21: Feature planning specs for Phases 0–3 under `docs/features-planning/` (auth family, RBAC, organizations, users, onboarding, referral, voting, contribution-estimation, auth-aesthetics).

[Unreleased]: https://github.com/monark-community/app/commits/main
