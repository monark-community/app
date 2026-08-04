# @monark/organizations

Owns the `Organization` entity: creation, membership, invites, and white-label settings. Every user belongs to one or more orgs; RBAC and feature flags scope against the active org.

Spec: [docs/features-planning/phase-1/organization-management.md](../../docs/features-planning/phase-1/organization-management.md).

## What's here (Phase 1 MVP)

- `/server` — `organizationsRouter` tRPC sub-router + read-interface (`getById`, `getByIdOrThrow`, `getBySlug`, `getUserOrgs`, `getCurrentOrg`, `requireOrg`).
- `/contracts` — event types for the lifecycle (`OrganizationCreatedEvent`, `OrganizationUpdatedEvent`, `MemberJoinedEvent`, `MemberRemovedEvent`, `InviteSentEvent`, `InviteAcceptedEvent`) ; all are emitted except `organization.member-removed`.
- `/client` — placeholder.

Prisma schema adds five models under `// ── MODULE: organizations ──`: `Organization`, `OrganizationMetadata`, `OrganizationMembership`, `Invite`, `OrgSlugRedirect`. The `User` model gains `memberships`, `sentInvites`, and `acceptedInvites` back-references.

## Key concepts

- **Active org lives in the session.** Once `@monark/auth` is in place, a Supabase JWT carries `activeOrganizationId`. `getCurrentOrg(ctx)` reads that claim and verifies the user still has a live membership before returning the org. Stale `org_id` after removal → returns null so the caller routes to the org switcher.
- **Slug is the URL identity.** Unique, mutable, and changes trigger a redirect entry in `OrgSlugRedirect` (90-day TTL). The `adminUpdate` rename flow already writes these rows ; the redirect middleware + cron cleanup ship later.
- **Invite role is a `roleId` FK to the `Role` table.** `@monark/rbac` is table-driven (no `Role` enum) ; `Invite.roleId` and `FeatureFlagOverride.roleId` both reference `Role.id`, and the invite's role must belong to the invite's org (enforced at the write layer).
- **Memberships soft-leave.** `leftAt` is set on removal rather than deleting the row; historical data stays auditable. Read functions filter `leftAt: null` for "current" views.

## Usage

```ts
// From another module's server code:
import { getCurrentOrg, requireOrg, getUserOrgs } from "@monark/organizations/server";

const current = await getCurrentOrg(ctx); // ctx: { userId, activeOrganizationId }
const orgs = await getUserOrgs(userId); // all non-deleted orgs where membership.leftAt is null
const org = await requireOrg(ctx); // throws NotFoundError if none
```

```ts
// From the web side:
const current = trpc.organizations.current.useQuery(); // Organization | null
const mine = trpc.organizations.mine.useQuery(); // Organization[]
```

## Public API

| Import path                       | Export                              | Kind                                                  |
| --------------------------------- | ----------------------------------- | ----------------------------------------------------- |
| `@monark/organizations/server`    | `organizationsRouter`               | tRPC router mounted under `organizations.*`           |
| `@monark/organizations/server`    | `getById(id)`                       | `(id) => Promise<Organization \| null>`               |
| `@monark/organizations/server`    | `getByIdOrThrow(id)`                | throws `NotFoundError` if absent                      |
| `@monark/organizations/server`    | `getBySlug(slug)`                   | `(slug) => Promise<Organization \| null>`             |
| `@monark/organizations/server`    | `getUserOrgs(userId)`               | `(userId) => Promise<Organization[]>`                 |
| `@monark/organizations/server`    | `getCurrentOrg(ctx)`                | reads `ctx.activeOrganizationId`, verifies membership |
| `@monark/organizations/server`    | `requireOrg(ctx)`                   | throws if no active org                               |
| `@monark/organizations/server`    | `Organization`, `OrgSessionContext` | types                                                 |
| `@monark/organizations/contracts` | event types (see below)             |                                                       |

tRPC procedures under `organizations.*`:

| Procedure                                      | Input                                                      | Output                 |
| ---------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| `organizations.current`                        | —                                                          | `Organization \| null` |
| `organizations.mine`                           | —                                                          | `Organization[]`       |
| `organizations.bootstrapStatus`                | —                                                          | `BootstrapStatus`      |
| `organizations.ensureBootstrap`                | `{ slug?, displayName?, primaryColor?, logoUrl? }?`        | bootstrap result       |
| `organizations.adminList`                      | `{ search?, cursor?, limit? }`                             | paged org list         |
| `organizations.adminGet`                       | `{ id }`                                                   | `Organization`         |
| `organizations.adminUpdate`                    | `{ id, displayName?, slug?, logoUrl?, primaryColor? }`     | `Organization`         |
| `organizations.invites.adminList`              | `{ organizationId }`                                       | pending invites        |
| `organizations.invites.adminListAll`           | `{ search?, roleIds? }?`                                   | pending invites        |
| `organizations.invites.adminCreate`            | `{ organizationId, email, displayName?, roleId, appUrl? }` | invite + token         |
| `organizations.invites.adminRevoke`            | `{ inviteId }`                                             | void                   |
| `organizations.invites.consumePending`         | —                                                          | `{ accepted }`         |
| `organizations.metadata.{list,get,set,delete}` | org-scoped metadata inputs                                 | metadata rows          |

## Dependencies

- `@monark/db` (Prisma)
- `@monark/common` (`TrpcContext`, `NotFoundError`)

Indirectly (once those ship): `@monark/auth` for session claims, `@monark/rbac` for role-gated mutations, `@monark/users` for member profile hydration in admin views.

## Operational

Prisma migration `20260424030538_add_organizations` creates the four tables and the User relations. Applied with `pnpm --filter @monark/db exec prisma migrate dev` like any other migration.

No seed data ships by default ; in single-tenant mode the first org is created by the bootstrap flow (`ensureSingletonOrganizationFromInput` / `organizations.ensureBootstrap`, driven by the `INITIAL_ORG_*` env vars), which emits `organization.created`.

## Events emitted

| Event                          | When                                      | Status                                       |
| ------------------------------ | ----------------------------------------- | -------------------------------------------- |
| `organization.created`         | bootstrap org creation                    | emitted                                      |
| `organization.updated`         | `adminUpdate` profile / slug change       | emitted ; carries `changed` + `previousSlug` |
| `organization.member-joined`   | invite accept / singleton auto-membership | emitted                                      |
| `organization.member-removed`  | admin removes a member                    | type declared, not yet emitted               |
| `organization.invite-sent`     | `invites.adminCreate` mutation            | emitted                                      |
| `organization.invite-accepted` | invite accept / auto-consume flow         | emitted                                      |

## Events consumed

- `user.signed-up` and `user.signed-in` — `registerOrganizationsSubscribers()` listens on both and runs `ensureSingletonMembership(userId)`. In single-tenant deploys with exactly one org, this idempotently upserts an `OrganizationMembership` row and emits `organization.member-joined` so downstream listeners (notifications, webhooks) see the user join with the same shape as an invite-driven membership. Short-circuits when the multi-tenant flag is ON, when there is zero or more than one org, or when the user already has an active membership in the singleton. Members the operator explicitly removed (rows with `leftAt` set) are NOT auto-rejoined — a sign-in won't silently undo an admin-initiated removal.

  Wire the subscriber once at api boot from [services/api/src/server.ts](../../services/api/src/server.ts), before `registerWebhookSubscribers()` so the derived `member-joined` event reaches the webhook outbox in the same emit pass.

## Deferred

Full scope from the planning doc; every item below ships once the dependent pieces land.

- **`createOrganization` / `deleteOrganization`** (self-service multi-org) — need the multi-tenant creation UI ; `adminUpdate` (org profile / slug / branding edit) already ships.
- **Member management** (`listMembers`, `removeMember`) — admin-guarded; ships after rbac.
- **`switchActiveOrg`** — mutates the Supabase session claim; requires the JWT claim plumbing from `@monark/auth`.
- **Slug-redirect middleware** — the `adminUpdate` rename flow already records `OrgSlugRedirect` rows (90-day TTL) ; only the resolving middleware + cleanup cron are still deferred.
- **White-label** (primary color, logo upload) — `primaryColor` + `logoUrl` are editable via `adminUpdate` (validated as hex ; note the column, not oklch) ; the Supabase Storage bucket (`org-logos`) for logo upload comes with the Branding tab.
- **Org switcher UI** + `/onboarding/create-org` + `/invite/<token>` pages — depend on `@monark/components` shadcn form primitives.
- **Multi-tenant UI** — the `tenancy.multi-tenant` flag is already registered (default OFF) and gates auto-membership + bootstrap ; the self-service multi-org creation UI ships later.
