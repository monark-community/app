# Monark App — Features Planning

Per-feature implementation specifications. Each doc is a standalone, hand-offable spec (goals, data model, API surface, UI flows, dependencies, edge cases, out-of-scope).

Two kinds of doc live here:

- **Shipped specs** — kept in the `phase-0/` … `phase-3/` folders as the **immutable historical record** of what a feature was designed to be. Per [CONTRIBUTING.md](../../CONTRIBUTING.md), these are **not** edited after a feature lands ; the as-built truth lives in the module's `README.md`, and divergence is recorded there, not retroactively here. Each shipped spec below links to its live module README.
- **Proposed specs** — in [`proposed/`](proposed/). Features that are designed but **not built**. These stay editable and are the live backlog of plans.

> Reality check: this folder was originally organized by phase 0–3 as a sequential roadmap. The platform since grew beyond that plan — the shipped set is now **14 core + 2 extended** modules (see [platform-overview.md](../technical-documentation/platform-overview/_index.md) for the authoritative as-is picture), and several shipped modules never had a phase spec (they were built directly and documented in their READMEs + `technical-documentation/`). The phase folders are retained as history, not as a current roadmap.

## Shipped

Foundational (`phase-0/`) — architecture + scaffolding, still accurate as history:

- [`phase-0/modular-architecture.md`](phase-0/modular-architecture.md) — the core/extended two-tier module model (live copy: [architecture.md](../technical-documentation/architecture/_index.md) + [extensibility-contract.md](../technical-documentation/extensibility-contract/_index.md)).
- [`phase-0/project-scaffolding.md`](phase-0/project-scaffolding.md) — stack + workspace layout (live copy: [architecture.md](../technical-documentation/architecture/_index.md)).
- [`phase-0/scaffolding-status.md`](phase-0/scaffolding-status.md) — the Phase-0 landing record.

Core modules (`phase-1/`) — all shipped:

| Spec                                                                                                                                                                                                                                                                                               | Live module                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`phase-1/feature-flags.md`](phase-1/feature-flags.md)                                                                                                                                                                                                                                             | [`@monark/feature-flags`](../../packages/feature-flags/README.md) |
| [`phase-1/user-management.md`](phase-1/user-management.md)                                                                                                                                                                                                                                         | [`@monark/users`](../../packages/users/README.md)                 |
| [`phase-1/organization-management.md`](phase-1/organization-management.md)                                                                                                                                                                                                                         | [`@monark/organizations`](../../packages/organizations/README.md) |
| [`phase-1/rbac-system.md`](phase-1/rbac-system.md)                                                                                                                                                                                                                                                 | [`@monark/rbac`](../../packages/rbac/README.md)                   |
| [`phase-1/auth-login-password.md`](phase-1/auth-login-password.md) · [`auth-password-strength`](phase-1/auth-password-strength.md) · [`auth-email-validation`](phase-1/auth-email-validation.md) · [`auth-trusted-devices`](phase-1/auth-trusted-devices.md) · [`auth-totp`](phase-1/auth-totp.md) | [`@monark/auth`](../../packages/auth/README.md)                   |
| [`phase-1/notifications-system.md`](phase-1/notifications-system.md)                                                                                                                                                                                                                               | [`@monark/notifications`](../../packages/notifications/README.md) |

Later core / extended work (`phase-2/`, `phase-3/`) — shipped:

| Spec                                                                                                                                        | Live module                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`phase-2/polymorphic-db.md`](phase-2/polymorphic-db.md) — runtime Data Models (replaced the hardcoded `Project`/`Industry` modules)        | [`@monark/data-models`](../../packages/data-models/README.md) + [`@monark/query`](../../packages/query/README.md)     |
| [`phase-3/data-models-file-fields.md`](phase-3/data-models-file-fields.md) — `FILE`/`ATTACHMENTS` field types                               | [`@monark/files`](../../packages/files/README.md)                                                                     |
| [`phase-3/data-models-visualizations.md`](phase-3/data-models-visualizations.md) — verdict: keep Calendar/Kanban as tabled extended modules | [`@monark/calendar`](../../packages/calendar/README.md) · [`@monark/kanban`](../../packages/kanban/README.md)         |
| [`phase-3/public-api.md`](phase-3/public-api.md) — v1 REST + OpenAPI                                                                        | [`@monark/public-api`](../../packages/public-api/README.md) + [`@monark/api-keys`](../../packages/api-keys/README.md) |
| [`phase-3/public-api-service-accounts.md`](phase-3/public-api-service-accounts.md) — v2 service accounts                                    | [`@monark/api-keys`](../../packages/api-keys/README.md)                                                               |

Shipped modules with **no** phase spec (built directly ; see their READMEs): [`@monark/webhooks`](../../packages/webhooks/README.md), [`@monark/secrets`](../../packages/secrets/README.md), [`@monark/automation`](../../packages/automation/README.md), [`@monark/branding`](../../packages/branding/README.md), [`@monark/files`](../../packages/files/README.md), [`@monark/calendar`](../../packages/calendar/README.md), [`@monark/kanban`](../../packages/kanban/README.md).

## Proposed (not built)

Live plans in [`proposed/`](proposed/):

- [`proposed/user-onboarding.md`](proposed/user-onboarding.md) — role-specific onboarding wizard.
- [`proposed/referral-system.md`](proposed/referral-system.md) — referral attribution + external-system integration.
- [`proposed/voting-system.md`](proposed/voting-system.md) — decentralized governance proposals/ballots.
- [`proposed/contribution-estimation.md`](proposed/contribution-estimation.md) — per-user contribution scoring.
- [`proposed/community-activity-feed.md`](proposed/community-activity-feed.md) — subscription-driven public profiles + posts/comments/reactions.
- [`proposed/network-trust-score.md`](proposed/network-trust-score.md) — invite-tree / delegation / trust ladder.
- [`proposed/social-automation.md`](proposed/social-automation.md) — event-driven social posting pipeline (token storage now rides [`@monark/secrets`](../../packages/secrets/README.md)).
- [`proposed/wiki.md`](proposed/wiki.md) — nested-page wiki (Notion-style tree + rich-text pages) as an extended `@monark/wiki` module ; **shipped** (live: [`@monark/wiki`](../../packages/wiki/README.md)).
- [`proposed/block-editor.md`](proposed/block-editor.md) — Notion-style block editor (BlockNote, JSON block storage) alongside rich text ; new Data Models `DOCUMENT` field type + wiki / kanban migrated (calendar stays rich text) ; **shipped**.
- [`proposed/global-search.md`](proposed/global-search.md) — extensible core search-source registry (`@monark/common`) + a `@monark/search` module (`search.global` fan-out) making the command palette truly global ; **shipped** (live: [`@monark/search`](../../packages/search/README.md)).

Sequencing notes for the acquisition (onboarding/referral) and engagement (voting/contribution) tracks live in [`phase-2/phase-planning.md`](phase-2/phase-planning.md) and [`phase-3/phase-planning.md`](phase-3/phase-planning.md).

## Product context

Monark App began as the central hub for five user types — **Admin** (Monark executive, invite-only), **Moderator** (elected community), **Developer** (self-onboarding), **Student** (short-term, guided), **Ambassador** (community-facing). Founding executive priorities: contribution quantification, decentralized voting, referral-system integration, automated marketing content, and living-data centralization. Several of those became the proposed specs above ; the "living-data centralization" priority is what the shipped Data Models engine delivers.

## How to read a feature doc

Every spec follows the same shape so reviewers can scan across them: **Context · Goals · Non-goals · User stories · Data model · API surface · UI flows · Dependencies · Integration points · Edge cases & risks · Success metrics · Implementation notes · Out of scope**.

## Conventions

- **Tech stack**: pnpm workspace rooted at `app/`. Next.js 15 App Router in `services/web`, Express 5 + tRPC v11 in `services/api`, Prisma against Supabase Postgres in `packages/db`, shadcn components via the `@monark` registry into `packages/components`. Full details in [architecture.md](../technical-documentation/architecture/_index.md).
- **Module layout**: one package per module (`@monark/auth`, `@monark/rbac`, …) with `/server`, `/client`, `/contracts` exports ; the boundary is enforced by `package.json#exports`. See [architecture.md](../technical-documentation/architecture/_index.md) and [extensibility-contract.md](../technical-documentation/extensibility-contract/_index.md).
- **Authoritative as-is reference**: [platform-overview.md](../technical-documentation/platform-overview/_index.md) supersedes any stale detail in the shipped specs here.
