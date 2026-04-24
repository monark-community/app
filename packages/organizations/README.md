# @monark/organizations

Owns the `Organization` entity: creation, membership, invites, and white-label settings. Every user belongs to one or more orgs; RBAC and feature flags scope against the active org.

Spec: [docs/features-planning/phase-1/organization-management.md](../../docs/features-planning/phase-1/organization-management.md).

## What's here (Phase 1 MVP)

- `/server` — `organizationsRouter` tRPC sub-router + read-interface (`getById`, `getByIdOrThrow`, `getBySlug`, `getUserOrgs`, `getCurrentOrg`, `requireOrg`).
- `/contracts` — event types for the lifecycle (`OrganizationCreatedEvent`, `MemberJoinedEvent`, `MemberRemovedEvent`, `InviteSentEvent`, `InviteAcceptedEvent`); all declared, none emitted yet.
- `/client` — placeholder.

Prisma schema adds four models under `// ── MODULE: organizations ──`: `Organization`, `OrganizationMembership`, `Invite`, `OrgSlugRedirect`. The `User` model gains `memberships`, `sentInvites`, and `acceptedInvites` back-references.

## Key concepts

- **Active org lives in the session.** Once `@monark/auth` is in place, a Supabase JWT carries `activeOrganizationId`. `getCurrentOrg(ctx)` reads that claim and verifies the user still has a live membership before returning the org. Stale `org_id` after removal → returns null so the caller routes to the org switcher.
- **Slug is the URL identity.** Unique, mutable, and changes trigger a redirect entry in `OrgSlugRedirect` (30-day TTL). That table is declared now; the redirect middleware + cron cleanup ship with the rename flow.
- **Invite role type is `String` temporarily.** `@monark/rbac` will introduce the canonical `Role` enum; at that point we swap the string column over. Same pattern as `@monark/feature-flags`'s override `role`.
- **Memberships soft-leave.** `leftAt` is set on removal rather than deleting the row; historical data stays auditable. Read functions filter `leftAt: null` for "current" views.

## Usage

```ts
// From another module's server code:
import { getCurrentOrg, requireOrg, getUserOrgs } from "@monark/organizations/server"

const current = await getCurrentOrg(ctx) // ctx: { userId, activeOrganizationId }
const orgs    = await getUserOrgs(userId) // all non-deleted orgs where membership.leftAt is null
const org     = await requireOrg(ctx)     // throws NotFoundError if none
```

```ts
// From the web side:
const current = trpc.organizations.current.useQuery()  // Organization | null
const mine    = trpc.organizations.mine.useQuery()     // Organization[]
```

## Public API

| Import path                             | Export                | Kind |
|-----------------------------------------|-----------------------|------|
| `@monark/organizations/server`          | `organizationsRouter` | tRPC router mounted under `organizations.*` |
| `@monark/organizations/server`          | `getById(id)`         | `(id) => Promise<Organization \| null>` |
| `@monark/organizations/server`          | `getByIdOrThrow(id)`  | throws `NotFoundError` if absent |
| `@monark/organizations/server`          | `getBySlug(slug)`     | `(slug) => Promise<Organization \| null>` |
| `@monark/organizations/server`          | `getUserOrgs(userId)` | `(userId) => Promise<Organization[]>` |
| `@monark/organizations/server`          | `getCurrentOrg(ctx)`  | reads `ctx.activeOrganizationId`, verifies membership |
| `@monark/organizations/server`          | `requireOrg(ctx)`     | throws if no active org |
| `@monark/organizations/server`          | `Organization`, `OrgSessionContext` | types |
| `@monark/organizations/contracts`       | event types (see below) | |

tRPC procedures under `organizations.*`:

| Procedure              | Input | Output |
|------------------------|-------|--------|
| `organizations.current`| —     | `Organization \| null` |
| `organizations.mine`   | —     | `Organization[]` |

## Dependencies

- `@monark/db` (Prisma)
- `@monark/common` (`TrpcContext`, `NotFoundError`)

Indirectly (once those ship): `@monark/auth` for session claims, `@monark/rbac` for role-gated mutations, `@monark/users` for member profile hydration in admin views.

## Operational

Prisma migration `20260424030538_add_organizations` creates the four tables and the User relations. Applied with `pnpm --filter @monark/db exec prisma migrate dev` like any other migration.

No seed data ships by default; the first org is created through the (not-yet-built) `createOrganization` flow.

## Events emitted

| Event                        | When                                            | Status |
|------------------------------|-------------------------------------------------|--------|
| `organization.created`       | `createOrganization` mutation                   | type declared, not yet emitted |
| `organization.member-joined` | invite accept / direct add                      | type declared |
| `organization.member-removed`| admin removes a member                          | type declared |
| `organization.invite-sent`   | `createInvite` mutation                         | type declared |
| `organization.invite-accepted` | invite accept flow                             | type declared |

## Events consumed

None yet.

## Deferred

Full scope from the planning doc; every item below ships once the dependent pieces land.

- **`createOrganization`, `updateOrganization`, `deleteOrganization`** — need an authenticated admin context from `@monark/auth` + `@monark/rbac`.
- **Invite flow** (`createInvite`, `listInvites`, `revokeInvite`, `acceptInvite`) — shares token-email infrastructure with `@monark/auth`'s email-validation; also needs `Role` enum from `@monark/rbac`.
- **Member management** (`listMembers`, `removeMember`) — admin-guarded; ships after rbac.
- **`switchActiveOrg`** — mutates the Supabase session claim; requires the JWT claim plumbing from `@monark/auth`.
- **Slug rename with redirect middleware** — `OrgSlugRedirect` table is present; middleware + 30-day cleanup cron ship with the rename UI.
- **White-label** (primary color, logo upload) — `primaryColor` + `logoUrl` columns exist; oklch validator + Supabase Storage bucket (`org-logos`) come with the Branding tab.
- **Org switcher UI** + `/onboarding/create-org` + `/invite/<token>` pages — depend on `@monark/components` shadcn form primitives.
- **`feature-flags` integration** — the spec's `orgs.multi-org` flag can be added to `FLAGS` when the multi-org UI ships.
