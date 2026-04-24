# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

No versioned releases have been cut yet. The app is pre-release; this file will grow as milestones land.

## [Unreleased]

### Added
- Phase 0 monorepo scaffolding: pnpm workspace, Turborepo, strict TypeScript base config, ESLint with service-import guards, Prettier, `.editorconfig`, `.nvmrc`.
- Infrastructure packages: `@monark/db` (Prisma), `@monark/common` (event bus, tRPC primitives, errors, Result, pino logger), `@monark/shared`, `@monark/components`.
- Services: `services/api` (Express 5 + tRPC v11 + cors + pino-http + zod env validation), `services/web` (Next App Router + Tailwind v4 + tRPC React Query client).
- Module manifest (`modules.manifest.ts`) plus the three codegen tools: `gen:module`, `gen:events`, `gen:routers`, with `--check` drift modes.
- `check:tiers` script enforcing that no extended module depends on another extended module.
- GitHub Actions CI workflow covering codegen drift, tier check, lint, typecheck, test.
- Feature planning specs for Phases 0–3 under `docs/features-planning/`, including auth-login-password, RBAC, TOTP, trusted devices, onboarding, referral, voting, contribution-estimation, and auth-aesthetics.

[Unreleased]: https://github.com/monark-community/app/commits/main
