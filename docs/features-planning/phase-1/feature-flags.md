# Feature Flags

## Context

Every other feature in this plan assumes the ability to ship code that's dormant until we flip a switch. Without flags, rolling out a new voting flow, beta-testing onboarding variants with students only, or deploying a broken Monark-specific module behind a kill-switch means redeploying the whole app. Flags decouple deploy from release.

The starter brief is explicit: **instance/deployment-based feature enabling/disabling**. That's the minimum. In practice we'll also need org-scoped flags (Monark execs want to preview a feature before ambassadors see it) and role-scoped flags (enable contribution-estimation for developers but not students during beta).

## Goals

- A single `isEnabled(flagKey, context?)` call usable from server components, client components, server actions, and route handlers.
- Flag definitions live in code (TypeScript); flag _values_ live in the database so they're editable without redeploy.
- Scopes: global (deployment-wide), per-org, per-role, per-user (for admin previews). Resolution cascades from most-specific to least.
- Admin UI for executives to list flags, toggle them, see who's affected.
- Flags are evaluated server-side and passed to the client as hydration data; no client-side fetch round-trip on every render.
- Audit log: every flag flip records who, when, what changed, and why (optional note).

## Non-goals

- Not building a percentage-rollout / A-B experimentation platform. Flags are on/off per scope. If we need experiments later, we integrate with PostHog or GrowthBook rather than grow this module.
- Not a full config system. Flags are boolean (or narrow enums like `"off" | "beta" | "on"`). Use env vars for configuration values.
- Not user-editable from the public product surface. Flag management is admin-only.

## User stories

- **As an admin**, I want to toggle a flag globally so I can kill a module in production without a deploy.
- **As an admin**, I want to enable a flag for a single org so we can preview features with Monark staff before rolling out.
- **As a developer (Monark user type)**, the features the admin enabled for my role appear automatically; I don't know or care that flags exist.
- **As a consumer of the `auth` / `voting` / etc. module**, I want to wrap UI and server logic in `isEnabled("voting", { userId, orgId })` and have it work uniformly.

## Data model

```prisma
model FeatureFlag {
  key         String   @id                       // "voting", "onboarding.v2"
  description String
  defaultOn   Boolean  @default(false)           // baseline if no scoped override
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  overrides   FeatureFlagOverride[]
}

model FeatureFlagOverride {
  id             String   @id @default(cuid())
  flagKey        String
  flag           FeatureFlag @relation(fields: [flagKey], references: [key], onDelete: Cascade)

  // exactly one of these is non-null; enforced by app logic + DB check constraint
  organizationId String?
  userId         String?
  role           Role?                           // enum from RBAC module

  enabled        Boolean
  setById        String                          // who flipped it
  setAt          DateTime @default(now())
  note           String?

  @@unique([flagKey, organizationId, userId, role])
  @@index([flagKey])
}
```

Flag _definitions_ live in code so the type system knows about them:

```ts
// packages/feature-flags/src/contracts/flags.ts
export const FLAGS = {
  voting: { description: "Decentralized voting module" },
  "contributions.quantification": { description: "Contribution estimation + reward surface" },
  "referral.external-sync": { description: "Sync with the external referral system" },
  "onboarding.v2": { description: "Redesigned onboarding flow" },
} as const;

export type FlagKey = keyof typeof FLAGS;
```

A seed step inserts a `FeatureFlag` row for each key at startup (upsert), so the DB stays in sync with code.

## API surface

Module `index.ts` exports:

```ts
export async function isEnabled(
  key: FlagKey,
  context?: { userId?: string; organizationId?: string; role?: Role },
): Promise<boolean>;

// Batch variant for server components that need many flags; single DB trip.
export async function getFlags(
  keys: FlagKey[],
  context?: { userId?: string; organizationId?: string; role?: Role },
): Promise<Record<FlagKey, boolean>>;

// Admin-only write path (RBAC-guarded inside):
export async function setOverride(
  key: FlagKey,
  scope: { organizationId?: string; userId?: string; role?: Role },
  enabled: boolean,
  note?: string,
): Promise<void>;
```

Client-side API mirrors the server one via a React hook:

```ts
// Hydrated from a server component; no fetch on render.
export function useFlag(key: FlagKey): boolean;
export function useFlags<K extends FlagKey>(keys: K[]): Record<K, boolean>;
```

## Resolution order

Most-specific override wins. Evaluated in order:

1. User-scoped override (exact `userId` match)
2. Role-scoped override (user's active role within the current org)
3. Org-scoped override (current org)
4. Global override (all scopes null)
5. `defaultOn` on the flag definition

Evaluation is deterministic and cacheable. We cache per-request in a React `cache()` call so repeated `isEnabled` within the same render tree hits the DB once.

## UI flows

### Admin flag dashboard (`/admin/feature-flags`)

- Table: flag key, description, default, override count, last change.
- Row click → flag detail: list of overrides with scope badges (Global, Org:X, Role:Y, User:Z), enabled/disabled, setter, note.
- "Add override" action: pick scope → pick target → on/off → optional note.
- "Revert" action per override.

### Per-page gating

Components wrap UI in:

```tsx
const votingEnabled = await isEnabled("voting", { userId, orgId });
if (!votingEnabled) return null;
```

For static navigation (sidebar links etc.) the flag is resolved in the root layout and passed down via a provider.

## Dependencies

- `users`: to scope flags by userId.
- `organizations`: to scope flags by orgId and to resolve the user's "current org" context.
- `rbac`: to read the user's role for role-scoped resolution and to guard the admin write path.

Each of those is also a Phase 1 core module, so the circular concern is moot — all of Phase 1 ships at once.

## Integration points

### Exposed to other modules

```ts
export { isEnabled, getFlags, useFlag, useFlags } from "./api";
export type { FlagKey };
```

### Events

```ts
export const FLAG_FLIPPED = "feature-flag.flipped";
export type FlagFlippedEvent = {
  flagKey: FlagKey;
  scope: { organizationId?: string; userId?: string; role?: Role };
  enabled: boolean;
  actorId: string;
  at: Date;
};
```

Extended modules can subscribe (e.g., voting emits an audit line when contribution-quantification flips on, so the two are known to have been co-active during a rewards period).

## Edge cases

- **Flag removed from code but overrides remain in DB.** Weekly `pnpm flags:prune` command (admin-triggered) that lists orphan overrides and optionally deletes them. Do not auto-prune on boot; it's a destructive op.
- **Stale client cache.** Flags are hydrated at request time. For long-lived tabs, a manual "refresh" or `revalidatePath` on flag flips keeps things correct. Worth documenting that flag flips take up to one navigation to propagate.
- **Multi-org user.** Flags are evaluated against the _active_ org in the session, not every org the user belongs to. Document this loudly in the admin UI to avoid confusion.
- **Race between flag flip and feature code path.** Flags are read inside the same transaction as the work when it matters (e.g., vote creation checks `isEnabled("voting")` right before insert).

## Risks

- **Silent bypass.** A developer forgets to wrap a new module behind its flag. Mitigate with a convention: every new module's `index.ts` starts with an `isEnabled` guard in its top-level server action, and a PR template checkbox reminds reviewers.
- **Admin UI becomes a foot-gun.** Someone disables `auth` in prod. Mitigate: certain flags (defined via `critical: true` in `FLAGS`) require a confirmation modal + retype-flag-name to flip.
- **Flag count sprawl.** Expect dozens, not hundreds. Every flag should have an owner and a sunset plan. Quarterly review cadence.

## Success metrics

- Zero deploys "just to toggle a feature" after launch.
- Admin flag changes propagate in < 60 seconds (next request).
- < 5% of code paths behind flags unused for > 90 days (indicator of dead flags).

## Implementation notes

- Flags resolve inside React's `cache()` so SSR is cheap.
- Public client components get flags via a `<FlagsProvider>` at the root of the app shell, hydrated from the nearest server component.
- Admin write path uses server actions with `requireRole("admin")` from RBAC.
- Audit via the `domain_events` table (see modular-architecture.md).

## Out of scope

- Rollout percentages (10% of users see the new thing).
- Timed flags (auto-off at date X).
- External flag provider integration. If adopted later, wrap it behind the same `isEnabled` API so call sites don't change.
