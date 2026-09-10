# Dev overlay ; a flag tree that explains itself

## Context

The Alt+D dev overlay's **Feature flags** panel
([`feature-flags.tsx`](../../../services/web/src/components/dev-overlay/panels/feature-flags.tsx))
renders `featureFlags.getAllForSession` as one alphabetically sorted flat list of dotted keys with
`on` / `off` beside each. That was right when there were six flags. There are now flags across
data-models, kanban, wiki, automation, chat, public-api, search, achievements and the integrations,
and the list is long enough that finding one means reading all of them.

Two things are missing, and the second is the one that actually costs debugging time:

1. **Structure.** Keys are already namespaced (`module.key`); the panel throws that away.
2. **Why.** A flag reads `off` and the panel cannot say whether that is the registered default, a
   global override, an org override, a role override, or a user override. Answering it today means
   querying `FeatureFlag` rows by hand. This is the single most common dev-overlay question, and
   the answer is already computed and then discarded.

Nothing else needs to change: `mostSpecific` in
[`resolve.ts`](../../../packages/feature-flags/src/server/resolve.ts) already picks the winning
override with the precedence `user > role > org > global`, then `getFlags` reduces it to a boolean.

## Goals

- **Group by namespace**, collapsible, with an on/total badge per group.
- **Show the source** of each resolved value: `default`, `global`, `org`, `role`, `user`.
- **Filter** by substring across the whole tree, keeping matching keys and their group headers.
- Keep the panel read-only. Flipping a flag from the overlay is a separate, larger decision
  (see Out of scope).

## Non-goals

- **An admin flag UI.** There is deliberately none today; overrides are `FeatureFlag` rows and
  `pnpm enable:dev-flags` flips the local set. The
  [docs audit](../../../CHANGELOG.md) called out that the docs wrongly claimed one existed. This
  spec does not add it.
- **Cross-user resolution** ("what would this flag be for Alice?"). That is an admin feature, not a
  dev-overlay one.

## Server change

`getAllForSession` keeps its shape for existing callers, and a sibling returns the richer value:

```ts
type ResolvedFlag = {
  value: boolean;
  source: "default" | "global" | "org" | "role" | "user";
  defaultOn: boolean;          // from the registered definition
  description?: string;        // canonical English registry string, NOT localized
};

featureFlags.getAllForSessionDetailed(): Record<string, ResolvedFlag>
```

Implemented by threading the already-selected `OverrideRow` out of `getFlags` rather than
recomputing: a `getFlagsDetailed` beside it, sharing `mostSpecific`, deriving `source` from which
of `userId` / `roleId` / `organizationId` is set on the winning row (all null = `global`, no row =
`default`). The unit suite that already covers `mostSpecific` extends to cover the mapping.

Gating is unchanged (`ctx.userId` required, no permission), because the panel resolves flags at the
**caller's own** scope. The description comes from the registry, which is
[not localized](../../agents/i18n.md) by convention.

## Panel

```
Feature flags                                     [12 / 31 on]
 ┌ filter ─────────────────────────────────────────────────┐
 automation                                        [2 / 3]  ▾
   enabled                             on   · org override
   graph-v2                            off  · default
   http-trigger                        on   · default
 data-models                                       [4 / 9]  ▸
 kanban                                            [1 / 1]  ▾
   board                               on   · user override
```

- Groups are the namespace before the first dot ; a key with no namespace (there should be none,
  but the parser tolerates it) falls into an _ungrouped_ bucket rather than being dropped.
- Group collapse state persists per browser in `localStorage`, wrapped in try/catch like every
  other stored preference. Default: groups with at least one non-default value are expanded, the
  rest collapsed, so the panel opens showing what is unusual about this session.
- The source is a muted suffix, not a badge, so the on/off column stays the thing the eye lands on.
  A value differing from its registered default is what earns emphasis.
- Filtering matches the full dotted key and the description, and expands every group with a hit.
- The existing `CollapsibleSection` and refetch button are reused as they are.

## Dependencies

None outside the two files. Reuses `CollapsibleSection`, the overlay's `devOverlay` i18n namespace
(new keys in en + fr), and the existing tRPC client.

## Edge cases and risks

- **A role override with several roles.** `FlagScope` carries a single `roleId`; if a user holds
  several, the source should say which role won, so `ResolvedFlag` carries the winning row's
  `roleId` and the panel resolves it to a name only when the label is already in the payload.
  Do not add a lookup per row.
- **An override row for a flag no longer registered.** `getFlags` skips unparseable keys and the
  panel lists only registered keys, so an orphan override is invisible here. That is correct for
  this panel and is a real gap for an operator ; the multi-tenancy removal already had to ship a
  migration deleting orphaned rows for exactly this reason. Worth a `check`-style tool rather than
  overlay UI.
- **Payload size.** Descriptions on 30+ flags is a few kilobytes on a dev-only panel behind an
  explicit open. Acceptable ; do not add pagination.

## Success metrics

- "Why is this flag off for me?" is answered in the overlay, without a database query.
- The panel stays readable at 3x the current flag count.

## Out of scope

- **Toggling a flag from the overlay.** Tempting and genuinely useful in dev, but it is a write to
  a shared table from a debug surface. If it is built: dev-only (`NODE_ENV !== "production"`, the
  same gate the overlay routes already use), writing a **user-scoped** override only, gated on
  `feature-flags.write`, and clearly labelled as affecting only the caller.
- **Flag dependency visualization** ("this flag is only checked when that one is on").
