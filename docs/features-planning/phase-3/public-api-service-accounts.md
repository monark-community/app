# Public API v2 — Service accounts (org-owned machine principals)

Follow-up to [public-api.md](public-api.md). v1 shipped **user keys** (key-as-user):
a key acts as the human who created it, managed self-serve at `/account/api-keys`.
This doc designs **v2**: org-owned, non-human principals whose keys act as a
dedicated _service account_, managed by admins.

## Context

### What v1 already gives us (reuse, do not rebuild)

- **`@monark/api-keys`** — the whole credential layer. `ApiKey` already carries
  `ownerUserId` + `organizationId` + `scopes`, and `authenticateApiKey` already
  reduces a key to `{ apiKeyId, userId, organizationId, scopes }`. v2 changes
  _who the owner is_, not the key mechanics.
- **The `/api/v1` facade** ([services/api/src/public](../../../services/api/src/public)) —
  auth → flag → scope → tRPC caller → error mapping. **Unchanged by v2**: it only
  ever sees a principal `{ userId, organizationId, scopes }` and doesn't care
  whether `userId` names a human or a machine.
- **RBAC** — `RoleAssignment.userId` FK, `OrganizationMembership`, `requireOrg`,
  `requirePermission`. A machine principal that is a real `User` row plugs into
  all of it with **no polymorphic-principal surgery**.

### What's greenfield (build)

- A **machine-user** representation + the guards that keep it out of every
  human-only path (sign-in, email, member pickers, account deletion).
- An **admin surface** to create service accounts, grant them roles, and
  mint/list/revoke their keys.
- A small set of **attribution** touch-ups so a machine actor reads clearly
  wherever a human normally would (`createdBy`, event `actorId`).

## Why v2 exists (the v1 limitation)

v1 user keys are perfect for a community member's personal workflow, but an
_organizational_ integration built on a human's key has three structural faults:

1. **It dies with the person.** Owner leaves / loses `api-keys.manage` / is
   deactivated → every integration on their key silently breaks.
2. **Attribution is wrong.** Every record shows `createdBy: alice`; audit trails
   name a human who didn't act.
3. **Blast radius is the human's grants.** A key can't be given access that is
   _different_ from whatever its owner happens to have.

A service account fixes all three: it is owned by the org, outlives any person,
attributes correctly, and holds its own admin-assigned permissions.

## Goals

- An org admin can create a **service account** (a named non-human principal),
  grant it roles, and mint/list/revoke API keys against it, all under `/admin`.
- A service-account key authenticates through the **exact v1 auth + facade path**
  — no change to `authenticateApiKey`, the mount, scopes, or rate limiting.
- A machine user can **never** sign in, receive email/notifications, appear in a
  member/assignee picker, or enter the account-deletion flow.
- Attribution reads correctly: records/events created by the key name the
  service account, not a person.
- Disabling or deleting a service account immediately kills its keys.

## Non-goals (this iteration)

- **No OAuth / third-party app authorization** — still keys only.
- **No cross-org service accounts** — a service account belongs to exactly one
  org (same org-pinning as v1 keys).
- **No per-key IP allowlists / per-key scopes-beyond-account** — a key's scopes
  still intersect its owner's grants; finer network controls are later.
- **No separate machine-principal table / polymorphic actor** — explicitly
  rejected (see Design decision 1).
- **No full audit-log facility** — still domain events + `lastUsedAt`.

## Design decisions

1. **A service account is a flagged `User` row, not a new principal type
   (DECIDED, from public-api.md decision 2).** Every actor FK in the schema
   (`RoleAssignment.userId`, `OrganizationMembership.userId`, `ApiKey.ownerUserId`,
   `createdBy` columns, event `actorId`) already points at `User.id`. Making the
   service account a `User` row means it flows through **all** of that unchanged.
   The alternative — a `ServiceAccount` table + a polymorphic "principal" abstraction
   — would touch RBAC, memberships, events, and every `createdBy` reader. Rejected.

2. **A `User.kind` discriminator (`HUMAN` | `SERVICE`), defaulting to `HUMAN`.**
   The single new column that lets every human-only path exclude machine rows.
   Backfill is trivial (all existing rows are `HUMAN` by default). Guards key off
   this, not off heuristics like the email domain.

3. **Machine user ids are minted by us with a distinct prefix; human ids stay
   Supabase-owned.** The house rule is "`User.id` is the Supabase Auth UUID; we
   never generate it" — service accounts are the deliberate exception. A machine
   id like `svc_<cuid>` is (a) never a valid Supabase auth subject, so it can
   never back a real session, and (b) visually unmistakable in logs. The sign-in
   path resolves users by Supabase session anyway, so a machine id is unreachable
   there even before the `kind` guard.

4. **Email stays non-null + unique; machine rows get a synthetic reserved-domain
   address.** `User.email` is a hot, non-null, unique column; making it nullable
   for one row type is a schema/complexity cost. Instead a service account gets
   `svc-<id>@service.invalid` (`.invalid` is RFC 2606 reserved — never
   deliverable, never collides with a real signup). Notification/email dispatch
   additionally short-circuits on `kind = SERVICE` so nothing is ever sent.

5. **A service account holds real RBAC roles, assigned by the admin at creation.**
   Not a bespoke scopes-only model — it gets `RoleAssignment`s like any member, so
   `requirePermission` works identically. The key's `scopes` then narrow further,
   exactly as in v1. This keeps "what can this key do?" answerable by the same
   RBAC UI/logic humans use.

6. **A new admin-tier permission gates service-account management, separate from
   the self-serve one.** `api-keys.manage` (v1) lets a member manage _their own_
   keys. `api-keys.manage-service-accounts` (v2, admin-tier, ADMIN short-circuits)
   gates creating service accounts and managing _their_ keys. A member with only
   the self-serve permission can't mint an org-owned principal.

7. **Lifecycle reuses `User.disabledAt`.** Disabling a service account stamps
   `disabledAt` on its machine row; `authenticateApiKey` already returns the
   principal, so we add one check: a key whose owner is disabled/deleted fails
   auth. Deleting a service account cascades its `ApiKey` rows (existing FK) and
   its memberships/role assignments.

## Architecture

```
Admin (/admin/api-keys or /admin/service-accounts)
  │  create service account  ─────────────►  User{ kind: SERVICE, id: svc_…, email: svc-…@service.invalid }
  │                                          + OrganizationMembership(org)
  │  assign roles            ─────────────►  RoleAssignment(userId = svc_…, roleId, org)
  │  mint key                ─────────────►  ApiKey(ownerUserId = svc_…, org, scopes)  → plaintext once
  ▼
External service ── Authorization: Bearer mrk_… ──►  /api/v1  (UNCHANGED facade)
                                                       authenticateApiKey → { userId: svc_…, org, scopes }
                                                       + NEW: reject if owner.disabledAt / deletedAt
                                                       → tRPC caller as svc_…  → RBAC via svc_…'s roles
```

The dashed arrow (the request path) is entirely v1. v2 is the box above it:
creating the principal and its keys.

## Data model changes

Small and additive — no new table.

- **`User.kind`** — new enum `UserKind { HUMAN SERVICE }`, `@default(HUMAN)`.
  In `base.prisma` (core, `// ── MODULE: users ──`). One migration, backfill via
  the default.
- **`User.createdBy`** (optional) — who created the service account, for
  attribution in the admin list. Nullable; humans leave it null. _(Or store this
  on a tiny `ServiceAccountMeta` sidecar if we want to avoid touching `User` twice
  — decide at build time; the `kind` column is the only strictly-required change.)_

Everything else (`ApiKey`, `RoleAssignment`, `OrganizationMembership`) is reused
as-is. No `ApiKey` schema change.

## Identity guards (the load-bearing safety work)

A machine row must be invisible to every human-only surface. Each is a
`kind = SERVICE` exclusion:

| Path                                    | Guard                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Supabase sign-in / session resolve      | Unreachable by construction (machine id isn't a Supabase subject) **+** defensive `kind` check in the session→user resolver. |
| Email + notification dispatch           | `notify()` / mailer short-circuits when the target user is `SERVICE`.                                                        |
| Member / assignee pickers, member lists | `listMembers`-style queries filter `kind = HUMAN` (service accounts show only in their own admin view).                      |
| Account deletion / grace flows          | Not applicable to machine rows; the `/account/*` surface is session-gated so a machine can't reach it anyway.                |
| Admin **Users** list                    | Excludes `SERVICE`; service accounts live in their own admin list.                                                           |
| `api-keys.list` (v1 self-serve)         | Still scoped to `ownerUserId = ctx.userId`, so a human never sees a service account's keys, and vice-versa.                  |

These guards are the bulk of v2's risk and test surface — a missed one is either
a broken integration (machine gets emailed) or a data-quality bug (machine shows
up as an assignee).

## Admin surface

`/admin/api-keys` (or `/admin/service-accounts` — name TBD), gated by
`api-keys.manage-service-accounts`:

- **List** service accounts: name, assigned roles, key count, created-by, status.
- **Create**: name + role selection (reuses the RBAC role picker) → provisions
  the machine `User` + membership + role assignments.
- **Manage keys** per account: mint (scope picker + expiry, same dialog shape as
  the v1 account UI → plaintext-once reveal), list, revoke.
- **Disable / delete** the account (kills its keys).

Much of the key-management UI is the v1 `api-keys-section` generalized to take an
explicit `ownerUserId` instead of always "me".

## tRPC surface

New procedures in `@monark/api-keys` (admin-gated), e.g. a `serviceAccounts`
sub-router: `list`, `create`, `assignRoles`, `disable`, `delete`, plus
`keys.{list,create,revoke}` parameterized by service-account id. The v1
`apiKeys.{list,create,revoke}` (self-serve) stay exactly as they are.

## Auth flow delta

One added check in `authenticateApiKey` (or the facade): after resolving the
owner, reject if the owner is `disabledAt`/`deletedAt`. This also retroactively
hardens v1 (a human key whose owner was deactivated should already fail — a small
correctness win we fold in here).

## Events, RBAC, notifications, flags (the four systems)

- **RBAC** — new `api-keys.manage-service-accounts` permission (admin category).
- **Events** — `api-keys.service-account-created` / `-disabled` (+ reuse
  `key-created`/`-revoked`). Webhook-subscribable via the event-type registry.
- **Notifications** — none _to_ a service account (guarded off). Optionally notify
  org admins when a service-account key is minted (nice-to-have, not required).
- **Feature flags** — reuse `public-api.enabled`; optionally a separate
  `public-api.service-accounts` sub-flag to roll v2 independently.

## Build order

1. `User.kind` enum + column + migration (backfill default). Regenerate schema.
2. Identity guards: sign-in resolver, `notify`/mailer, member/assignee queries,
   admin Users list — each excludes `SERVICE`. **Tests per guard.**
3. `authenticateApiKey` owner-alive check (hardens v1 too).
4. `serviceAccounts` tRPC sub-router + `api-keys.manage-service-accounts`
   permission + events.
5. Admin UI (`/admin/...`): list + create + per-account key management (generalize
   the v1 section). i18n en + fr.
6. Integration tests: create a service account via the admin path, mint a key,
   drive `/api/v1` with it (acts as the machine, RBAC via its roles), confirm the
   guards (machine never emailed / never in member list), confirm disable → 401.

## Verification

- Unit: `kind` guard helpers; owner-alive auth check.
- Integration (extend [public-api.test.ts](../../../services/api/tests/integration/public-api.test.ts)
  pattern): a service-account key exercises the same `/api/v1` routes; a disabled
  account's key → 401; a machine user is absent from member listing + gets no
  notification.
- Gate: `pnpm gen && typecheck && lint && test && check:tiers && check:modules && check:i18n`.

## Open decisions (confirm before building)

1. **Admin route/name**: `/admin/api-keys` vs `/admin/service-accounts`. (Leaning
   `service-accounts` — the noun is the principal, keys are a detail under it.)
2. **`User.createdBy` on the User row vs a sidecar** — column is simplest; sidecar
   avoids a second `User` change. Low stakes.
3. **Roles model**: free role assignment (reuse the member role picker) vs a
   constrained "service roles" set. Recommend free assignment for uniformity.
4. **Independent flag** (`public-api.service-accounts`) or fold into
   `public-api.enabled`. Recommend a sub-flag so v2 ships dark independently.
5. **Optional admin notification** when a service-account key is minted (audit
   comfort) — yes/no.
