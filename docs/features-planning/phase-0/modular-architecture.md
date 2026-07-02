# Modular Architecture

## Context

The starter brief mandates a two-tier module architecture: a **core** tier that's coupled and unremovable, plus an **extended** tier that's Monark-specific, self-contained, and communicates only through well-defined interfaces. This document pins down what "module," "core," and "extended" mean in code, how modules talk to each other, and the rules enforcement can rely on during review.

The decision is upfront because every downstream feature inherits from it. If we leave the boundaries vague, the extended modules silently couple and we lose the ability to remove any of them independently; the executive ask ("contribution quantification, voting, referral integration") is exactly the class of feature that changes often and benefits from replaceability.

The implementation shape (decided in [`project-scaffolding.md`](project-scaffolding.md)): each business module is its own **workspace package** (`@monark/auth`, `@monark/rbac`, …) with three entry points — `/server`, `/client`, `/contracts`. Workspace package boundaries _are_ the module boundaries; there's no way to reach inside another module by file path because files outside the exported entry points aren't resolvable.

## Goals

- One workspace package per business module. Module name matches package name.
- Each module package exposes exactly three subpath exports: `/server` (backend), `/client` (frontend), `/contracts` (shared Zod + types). Anything else is internal and unreachable from outside.
- Core modules may depend on each other. Extended modules may depend on core modules but never on another extended module.
- Cross-extended communication goes through a central **event bus** (in-process, backend-side, owned by `@monark/common`) and a small set of **read interfaces** exported by core modules' `/server`.
- Adding, removing, or rewriting any single extended module must compile and pass tests with zero changes to other extended modules.

## Non-goals

- Not building a plugin system with runtime loading. Modules are compile-time units.
- Not a public SDK. "Module" here is internal code organization, not a marketplace primitive.
- Not polyrepo. Every module lives inside the `app/` workspace.

## Module anatomy

Every business module is a directory under `app/packages/`:

```
packages/<module-name>/
  package.json             # name: @monark/<module-name>; three exports only
  tsconfig.json
  src/
    server/
      index.ts             # public: tRPC sub-router, read-interface fns, event wiring
      procedures/          # tRPC procedure implementations
      domain/              # business logic, zero framework imports
      data/                # Prisma queries (imports from @monark/db)
      events/              # publishers + subscribers owned by this module
    client/
      index.ts             # public: React components, hooks, page composers
      ui/                  # module-owned React components
      hooks/               # React hooks
      pages/               # page composers referenced by services/web's app router
    contracts/
      index.ts             # public: Zod schemas + event type defs (shared server+client)
  tests/
```

Not every module uses all three entry points. A purely backend module with no UI ships only `/server` + `/contracts`. A module whose frontend is just route composition ships a minimal `/client`. Empty exports are still declared (returning `{}`) so external imports resolve predictably.

### `package.json` shape

```json
{
  "name": "@monark/auth",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./server": "./src/server/index.ts",
    "./client": "./src/client/index.ts",
    "./contracts": "./src/contracts/index.ts"
  },
  "dependencies": {
    "@monark/db": "workspace:*",
    "@monark/common": "workspace:*"
  }
}
```

The three `exports` subpaths + nothing else mean: if any consumer imports `@monark/auth/domain/password-rules` or `@monark/auth/src/server/procedures/sign-in`, TypeScript's module resolution fails. No escape hatches, no lint rule needed for the "don't reach into internals" case.

### What each entry point exports

**`@monark/<name>/server`** (consumed by `services/api` and other modules' `/server`)

- The module's tRPC sub-router (assembled from its `procedures/`), re-exported as a named constant (e.g. `authRouter`).
- Read-interface functions for other modules to call (`getById`, `hasRole`, `getCurrent`, …).
- Event emitter / subscriber registration hooks (if any — otherwise events are fired inline from procedures).

**`@monark/<name>/client`** (consumed by `services/web` and other modules' `/client`)

- React components other modules' frontends may compose (rare — e.g., `<RoleBadge>` from `@monark/rbac/client`).
- React hooks (`useCurrentUser`, `useOrgSwitcher`).
- Page composer components referenced by `services/web/src/app/**/page.tsx` (which stay as thin wrappers).

**`@monark/<name>/contracts`** (consumed by anyone, including core dev tools)

- Zod schemas that define the module's data shape on the wire.
- Event type definitions (type-only; the runtime bus lives in `@monark/common`).

## Core vs extended

### Core (Phase 1)

Coupled by design. Each may depend on any other core module via `workspace:*` in its `package.json#dependencies`.

- `@monark/feature-flags` — queryable flag state, scoped by deployment and org
- `@monark/auth` — session, credentials, TOTP, trusted devices
- `@monark/organizations` — multi-org model, invites, white-label settings
- `@monark/users` — profile, user→org membership
- `@monark/rbac` — role assignments, permission checks

Rule of thumb: if removing the module would break every other module in the app, it's core.

### Extended (Phase 2+)

Must not depend on another extended module. Declared dependencies may only name:

- Core modules (`@monark/auth`, `@monark/rbac`, …)
- Infrastructure packages (`@monark/db`, `@monark/common`, `@monark/shared`, `@monark/components`)

Communication between extended modules happens only through:

- **Core read interfaces** — e.g., `users.getById`, `rbac.hasRole`, `organizations.getCurrent`.
- **Event bus** (`@monark/common/events`) — publish domain events, subscribe to what you need. Event _types_ come from each module's `/contracts`.
- **Feature flags** — gate your own UI and logic; never as a proxy for querying another extended module's state.

If two extended modules genuinely need to share state, the shared concept gets promoted to a core package (or absorbed into `@monark/common`). Prefer refactoring over adding a cross-extended dep.

## The event bus

Split responsibility: **one central runtime**, **distributed type ownership**, **generated master union**.

- Runtime (`emit`, `on`, persistence, dispatcher) lives in `@monark/common/src/events.ts`. Backend-only; imported by module `/server` code from `services/api`. One file, one implementation.
- Each module declares its own event types in its own `/contracts/events.ts`. The emitter owns the shape.
- The master `DomainEvent` union (what typechecks `emit` and `on`) is **generated** by a codegen step into `@monark/common/src/contracts/events.generated.ts`. Hand-written code never edits that file.

This avoids the dependency cycle that a hand-maintained master union would introduce (`common` importing from every module) while still giving `emit` / `on` full discriminated-union type safety.

### Per-module contract shape

Each module's `/contracts/events.ts` exports:

1. Individual event types (`BallotCastEvent`, `BallotClosedEvent`, …).
2. A per-module union named `<Module>Events`, exported for the codegen to pick up.
3. `never` if the module has no events (keeps the generated file uniform).

```ts
// packages/voting/src/contracts/events.ts
import type { DomainEventBase } from "@monark/common/contracts/events";

export type BallotCastEvent = DomainEventBase & {
  type: "ballot.cast";
  ballotId: string;
  userId: string;
  choice: string;
};

export type BallotClosedEvent = DomainEventBase & {
  type: "ballot.closed";
  ballotId: string;
  closedAt: Date;
  outcome: "passed" | "failed" | "tied";
};

export type VotingEvents = BallotCastEvent | BallotClosedEvent;
```

### Hand-written code in `@monark/common`

```ts
// packages/common/src/contracts/events.ts
export interface DomainEventBase {
  type: string;
  occurredAt: Date;
  correlationId?: string;
}

// Re-exports the generated union so consumers import from a stable path.
export type { DomainEvent } from "./events.generated";
```

```ts
// packages/common/src/events.ts  (runtime; backend-only)
import type { DomainEvent } from "./contracts/events";

export function emit<E extends DomainEvent>(event: E): Promise<void>;
export function on<E extends DomainEvent>(
  type: E["type"],
  handler: (event: E) => Promise<void>,
): void;
```

### Generated file

```ts
// packages/common/src/contracts/events.generated.ts
// AUTO-GENERATED by `pnpm gen:events`. Do not edit by hand.

import type { AuthEvents } from "@monark/auth/contracts";
import type { OrganizationEvents } from "@monark/organizations/contracts";
import type { UsersEvents } from "@monark/users/contracts";
import type { RbacEvents } from "@monark/rbac/contracts";
import type { OnboardingEvents } from "@monark/onboarding/contracts";
import type { ReferralEvents } from "@monark/referral/contracts";
import type { VotingEvents } from "@monark/voting/contracts";
import type { ContributionsEvents } from "@monark/contributions/contracts";

export type DomainEvent =
  | AuthEvents
  | OrganizationEvents
  | UsersEvents
  | RbacEvents
  | OnboardingEvents
  | ReferralEvents
  | VotingEvents
  | ContributionsEvents;
```

### The codegen script

`app/tools/gen-events.ts` (~80 lines of plain TypeScript):

1. Reads `app/modules.manifest.ts` to find every registered module.
2. For each module, asserts its `/contracts` entry point exports `<Module>Events` (fails loudly otherwise; typo protection).
3. Renders the generated file with stable ordering (sorted by module name) so diffs stay readable.
4. Writes to `packages/common/src/contracts/events.generated.ts`.

Two modes:

- `pnpm gen:events` — write mode; regenerates the file.
- `pnpm gen:events --check` — CI mode; compares current output to what gen _would_ produce and exits non-zero on drift. Caught drift means someone added a module or event without running gen.

### Wiring

- Root `package.json` gets `"gen:events"` and a `"prebuild"` that runs gen in write mode.
- CI runs `pnpm gen:events --check` before typecheck.
- `dev` scripts that rebuild on file change (turbo, tsc --watch) pick up the regenerated file automatically; no extra watcher needed for the common case.

### Type-only imports = no runtime cycle

Every import in the generated file is `import type { … }`. TypeScript erases these at emit; there is zero runtime linkage between `@monark/common` and any module. `@monark/common`'s `package.json#dependencies` stays empty of module references; the generated file's imports resolve through the workspace (`pnpm` + `tsconfig paths`) without needing a declared dep. The "cycle" exists only in the type graph, which TypeScript handles natively.

### Persistence and delivery

Events are persisted to a `domain_events` Postgres table (owned by `@monark/db`) for audit and replay. Handlers run in the same transaction when emitted from within a tRPC procedure; otherwise they run on an inline async queue. Upgrade to BullMQ (or Postgres `LISTEN/NOTIFY`) when the api scales past one process; see the risks section of [`project-scaffolding.md`](project-scaffolding.md).

## Read interfaces

Core modules expose read-only functions from their `/server/index.ts` for other modules to call. These are the only sanctioned cross-module reads.

```ts
// packages/users/src/server/index.ts
export async function getById(id: string): Promise<User | null>;
export async function getCurrentUser(ctx: TrpcContext): Promise<User | null>;

// packages/rbac/src/server/index.ts
export async function hasRole(userId: string, role: Role, orgId?: string): Promise<boolean>;
export async function requireRole(ctx: TrpcContext, role: Role): Promise<User>; // throws if not
```

Extended modules never query another module's Prisma tables directly. They call read interfaces or consume events.

The web side consumes the _same_ data through tRPC procedures — an `@monark/voting/client` hook calls `trpc.users.getById.useQuery(...)` rather than importing from `@monark/users/server`. The server import is forbidden in client code by the ESLint boundary rule.

## Dependency enforcement

Three overlapping guards, roughly from cheapest to catch to strictest:

1. **Package.json depgraph.** If `@monark/voting` doesn't declare `@monark/users` in its `dependencies`, TypeScript fails to resolve the import. This is the primary enforcement. You can't accidentally cross a boundary you haven't declared.

2. **ESLint rule** (`eslint-plugin-boundaries`), scoped narrowly to two things package.json can't catch:
   - Forbid `services/web/**` importing `@monark/*/server`.
   - Forbid `services/api/**` importing `@monark/*/client`.
     (Everything inter-module is already blocked by package.json + the three-exports wall.)

3. **Module manifest + tier check.** `app/modules.manifest.ts` declares each module's tier:

   ```ts
   export const MODULES = {
     "@monark/auth": { tier: "core" },
     "@monark/organizations": { tier: "core" },
     "@monark/users": { tier: "core" },
     "@monark/rbac": { tier: "core" },
     "@monark/feature-flags": { tier: "core" },
     "@monark/onboarding": { tier: "extended" },
     "@monark/referral": { tier: "extended" },
     "@monark/voting": { tier: "extended" },
     "@monark/contributions": { tier: "extended" },
   } as const;
   ```

   `pnpm check:tiers` walks every extended module's `package.json#dependencies` and fails if any of them names another extended module. Minimal script; catches the only boundary a pure depgraph can't (since workspace deps are compile-fine regardless of tier).

## Risks

- **Package count sprawl.** By end of Phase 3, ~14 workspace members. pnpm handles it; the cognitive cost is the per-feature "which package owns this?" question. The three-exports pattern makes the answer mechanical.
- **Event bus becomes a god object.** Mitigate by keeping event types narrowly scoped, co-located with the owning module's `/contracts`, and reviewed on every PR.
- **Generated `events.generated.ts` drifts.** `pnpm gen:events --check` runs in CI; a PR that adds an event without regenerating fails there. The generated file is committed (not gitignored) so reviewers can see the exact union delta in the diff.
- **Read interfaces grow until extended modules effectively depend on core internals.** Mitigate by keeping each core module's `/server/index.ts` intentionally small and adding only what a concrete extended module demonstrably needs.
- **Extended-extended dependency temptation.** Caught by `check:tiers` in CI; also obvious in PR diff when a new extended package appears in another extended's `package.json`.
- **Prisma schema is shared across modules.** Every module's `data/` queries a schema owned by `@monark/db`. Real tension: modules "own" logical tables but can't own their slice of the schema file. Mitigate with section comments (`// ── MODULE: auth ──`) and a pre-commit check that warns when a PR edits outside the module its changes belong to without explicit opt-in.
- **Circular core deps.** Auth references users, users references auth sessions, etc. Mitigate by keeping read interfaces minimal (one-way where possible) and pushing truly shared concepts into `@monark/common`. If a cycle still appears, extract the shared slice to a fourth package.

## Out of scope

- Runtime plugin loading or hot-swapping modules.
- Module-level permissions (permissions live in RBAC, not in module boundaries).
- Publishing a module outside the monorepo. If a module's primitives become generally useful, promote the primitives (not the module) into `@monark/shared`.
