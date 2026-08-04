# Monark App — Features Planning

This folder maps every desired feature of the Monark App to an implementation phase, and documents each as a standalone, reviewable specification. Each feature doc is written to be hand-offable to whoever implements it, with explicit goals, data model, API surface, UI flows, dependencies, edge cases, and out-of-scope.

## Product context

Monark App is the central hub for five user types:

| Role                         | Relationship                | Onboarding style                                                          |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| **Admin** (Monark executive) | Long-term, internal         | Invite-only; privileged by default                                        |
| **Moderator**                | Long-term, external         | Elected from the community; privileged to moderate community interactions |
| **Developer**                | Long-term, external         | Decentralized, self-onboarding, retained                                  |
| **Student**                  | Short-term (4–8 months)     | Guided onboarding; may convert to Developer                               |
| **Ambassador**               | Long-term, community-facing | Represents Monark in local and digital communities                        |

Executive priorities:

- **Contribution quantification**: measure individual impact so rewards can be distributed fairly.
- **Decentralized voting**: community-driven decisions on the matters that affect them.
- **Referral-system integration**: plug into Monark's existing referral system instead of replacing it.
- **Automated marketing content**: runtime-produced posts and assets generated from preconfigured dynamic layouts.
- **Living-data centralization**: one source of truth for ongoing projects and statuses, university documentation, student project team pictures, etc.

## Architecture

Two module tiers, both documented in [`phase-0/modular-architecture.md`](phase-0/modular-architecture.md):

- **Core modules**: foundational, coupled, cannot be removed. Feature flags, auth, organizations, users, RBAC, notifications.
- **Extended modules**: Monark-specific, self-contained, communicate with each other and core only through well-defined interfaces. Removing one must not break another.

Each business module is its own workspace package (`@monark/auth`, `@monark/voting`, …) with three entry points: `/server`, `/client`, `/contracts`. Workspace package boundaries _are_ the module boundaries; you can't reach into another module by file path because the internals aren't exported. Two thin services (`services/web` for Next.js 16, `services/api` for Express 5 + tRPC) consume those packages. See [`phase-0/project-scaffolding.md`](phase-0/project-scaffolding.md) for the full layout.

Extended modules that _must_ depend on another one would declare that through the module manifest; two extended modules should never silently couple, and the preferred fix is to promote the shared concept into a core package.

## Phases

Each phase has a [`phase-planning.md`](phase-0/phase-planning.md) that defines the concrete implementation order and exit criteria. Read that first before opening individual feature docs.

### Phase 0 — Foundation

Non-feature work; decides the shape of everything downstream.

- [`phase-0/phase-planning.md`](phase-0/phase-planning.md) — implementation order
- [`phase-0/modular-architecture.md`](phase-0/modular-architecture.md)
- [`phase-0/project-scaffolding.md`](phase-0/project-scaffolding.md)

### Phase 1 — Core modules

Coupled; ship together. Anything after Phase 1 assumes the full core is live.

- [`phase-1/phase-planning.md`](phase-1/phase-planning.md) — implementation order
- [`phase-1/feature-flags.md`](phase-1/feature-flags.md)
- [`phase-1/user-management.md`](phase-1/user-management.md)
- [`phase-1/organization-management.md`](phase-1/organization-management.md)
- [`phase-1/rbac-system.md`](phase-1/rbac-system.md)
- [`phase-1/auth-login-password.md`](phase-1/auth-login-password.md)
- [`phase-1/auth-password-strength.md`](phase-1/auth-password-strength.md)
- [`phase-1/auth-email-validation.md`](phase-1/auth-email-validation.md)
- [`phase-1/auth-trusted-devices.md`](phase-1/auth-trusted-devices.md)
- [`phase-1/auth-totp.md`](phase-1/auth-totp.md)
- [`phase-1/auth-aesthetics.md`](phase-1/auth-aesthetics.md)
- [`phase-1/notifications-system.md`](phase-1/notifications-system.md)

### Phase 1.5 — Extended modules: CRM / Living Data

Replace Notion as the operational system of record. Depends on the full Phase 1 core.

- [`phase-1.5/phase-planning.md`](phase-1.5/phase-planning.md) — implementation order and exit criteria
- [`phase-1.5/notion-database-audit.md`](phase-1.5/notion-database-audit.md) — which Notion DBs to extract, defer, or keep
- [`phase-1.5/crm-ux-design.md`](phase-1.5/crm-ux-design.md) — design principles, navigation, interaction patterns
- [`phase-1.5/crm-data-model.md`](phase-1.5/crm-data-model.md) — Prisma schemas, migration strategy, RBAC permissions, domain events
- [`phase-1.5/project-directory.md`](phase-1.5/project-directory.md) — `@monark/projects` spec
- [`phase-1.5/contacts-partners.md`](phase-1.5/contacts-partners.md) — `@monark/contacts` spec
- [`phase-1.5/student-teams.md`](phase-1.5/student-teams.md) — `@monark/teams` spec
- [`phase-1.5/apps-hub.md`](phase-1.5/apps-hub.md) — Apps Hub / service directory

### Phase 2 — Extended modules: outreach & marketing

Marketing automation and referral growth. Depends on Phase 1.5 CRM data.

- [`phase-2/phase-planning.md`](phase-2/phase-planning.md) — implementation order
- [`phase-2/user-onboarding.md`](phase-2/user-onboarding.md) — moved to Phase 3
- [`phase-2/referral-system.md`](phase-2/referral-system.md)

### Phase 3 — Extended modules: engagement & governance

Value-capture features that require users to already be active.

- [`phase-3/phase-planning.md`](phase-3/phase-planning.md) — implementation order
- [`phase-3/voting-system.md`](phase-3/voting-system.md)
- [`phase-3/contribution-estimation.md`](phase-3/contribution-estimation.md)

## Cross-phase dependency map

```
phase-0 (architecture, scaffolding)
   │
   ▼
phase-1 (core modules, all coupled)
   ├── feature-flags ──┐
   ├── auth ───────────┤
   ├── orgs ───────────┤
   ├── users ──────────┼──► consumed by every extended module
   ├── rbac ───────────┤
   └── notifications ──┘  (subscribes to events from auth, users, orgs ;
                           extended modules emit events it dispatches)
   │
   ▼
phase-1.5 (extended: CRM / living data)  ← replaces Notion as system of record
   ├── projects    ← depends on: core
   ├── contacts    ← depends on: core
   ├── teams       ← depends on: core; emits events consumed by marketing
   └── apps-hub    ← config-level; no module
   │
   ▼
phase-2 (extended: outreach & marketing)
   ├── marketing   ← depends on: core + CRM events via webhooks
   └── referral    ← depends on: users, orgs; integrates with Reffinity
   │
   ▼
phase-3 (extended: engagement & governance)
   ├── onboarding             ← depends on: auth, orgs, users, rbac
   ├── voting-system          ← depends on: users, rbac; emits events to analytics
   └── contribution-estimation ← depends on: users, rbac; consumes activity events
                                   from onboarding (progress), voting (participation),
                                    and external systems (GitHub, reviews, etc.)
```

No extended module in Phase 2/3 imports from another extended module directly. Communication goes through **events** (emitted when a user completes onboarding, votes, refers, etc.) and **read interfaces** (query user state, role, org). Both surfaces are defined by the core, not by individual extended modules.

## How to read each feature doc

Every feature doc follows the same shape so reviewers can scan across them without re-learning a structure:

- **Context** — why this feature, what problem it solves, what prompted it
- **Goals** — concrete, testable outcomes
- **Non-goals** — explicit out-of-scope, to prevent scope creep during implementation
- **User stories** — who does what, in which role
- **Data model** — Prisma-flavored schema sketches
- **API surface** — server actions / REST endpoints / tRPC procedures
- **UI flows** — screens, states, transitions
- **Dependencies** — which core modules are consumed, which extended modules (if any) are required
- **Integration points** — hooks / events / interfaces this feature exposes for others to consume
- **Edge cases & risks**
- **Success metrics** — what tells us it's working (where measurable)
- **Implementation notes** — tech hints specific to our stack (Next 16, Prisma, Supabase, auth provider)
- **Out of scope / future iterations**

## Conventions

- **Tech stack**: pnpm workspace rooted at `app/`. Next 16 App Router in `services/web`, Express 5 + tRPC v11 in `services/api`, Prisma against Supabase Postgres in `packages/db`, shadcn via `@monark/ui` into `packages/components`. Full details in [`phase-0/project-scaffolding.md`](phase-0/project-scaffolding.md).
- **Module layout**: one package per business module (`@monark/auth`, `@monark/rbac`, …) with `/server`, `/client`, `/contracts` exports. Boundary is enforced by `package.json#exports` — no escape hatches. See [`phase-0/modular-architecture.md`](phase-0/modular-architecture.md).
- **Auth provider**: Supabase Auth for primary credentials + OAuth; custom logic layered on top for TOTP, trusted devices, and role resolution. See [`phase-1/auth-login-password.md`](phase-1/auth-login-password.md).
- **Role source of truth**: a single `user_roles` table scoped by `(user_id, organization_id)`. Details in [`phase-1/rbac-system.md`](phase-1/rbac-system.md).
- **Feature flags**: consulted at both server and client boundaries; flags are scoped per deployment / per org where it matters. Details in [`phase-1/feature-flags.md`](phase-1/feature-flags.md).
- **Event bus**: in-process pub/sub owned by `@monark/common` (backend-only runtime), Postgres-backed audit log via `@monark/db`. Extended modules publish domain events, subscribe to what they need. No direct cross-module imports.
