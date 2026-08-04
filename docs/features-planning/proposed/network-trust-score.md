# Network Invites, Delegation Tree & Trust Score

## Context

Monark is a Web3 community organized around real-world projects. The app is the central hub where members participate in those projects, build reputation / trust, and climb an org-chart-style ladder (contributor to scope leader to ambassador). Two mechanics drive that ladder:

1. **Invitation as tree-building.** Membership is invite-only, plus admin-configurable self-serve "OTP-like" join routes (for cohorts we have direct contact with, e.g. student projects). Inviting someone should feel like growing your branch of the network, which gives ambassadors a clear, self-reinforcing path.
2. **Delegation.** High-level decisions sit at the top ; authority delegates into smaller and smaller **scopes**, each with a leader responsible for reporting progress upward. A company org chart, upside-down.

Today the app has a flat, single-hop invite system (`Invite.invitedById` to `acceptedById`, an atomic membership + role assignment on accept), table-driven RBAC with no hierarchy and no delegated granting, a `projects` module (the real contribution surface: `org` to `project` to `contributor`, where a contributor is an `OrganizationMembership`), and a metadata sidecar for schema-free per-user / per-org data. There is no parent / child tree, no upline / downline, and no trust / score code anywhere ; this is green field.

This spec deliberately supersedes three previously documented non-goals: `phase-1/organization-management.md` ("flat, no parent / child"), `phase-1/rbac-system.md` ("no delegation"), and the single-level framing in `phase-2/referral-system.md`.

### Design decisions

- **Trust basis: verified contribution only.** Growing the tree helps indirectly (your people contribute) ; raw invite headcount earns nothing. This is the anti-gaming decision ; if the tree itself drove score, inviting would become a pyramid farm.
- **Two separate graphs.** Invite lineage is immutable history ; the delegation tree is a separate, editable structure. The tree may be seeded from lineage as a UI convenience but is never bound to it.
- **Delegation unit: a first-class `Scope`.** Scopes are the nodes (org-chart boxes) and nest inside one Monark org ; people are placed into scopes. Not nested sub-organizations.
- **This spec's scope: foundation plus a thin trust-score v1.** The full contribution-scoring engine (`phase-3/contribution-estimation.md`) is deferred ; this trust module is its on-ramp, not a competitor.

## Goals

- Every membership records the branch it grew from (`invitedByMembershipId`), set once on join and never re-parented.
- Inviting is quota-bounded (per role, with per-member override) so the tree grows deliberately, not through spam.
- Admins / sysadmins can mint self-serve **join routes** (OTP-like codes) that create a membership, grant a role, and optionally drop the joiner into a specific scope ; suited to student cohorts.
- A `Scope` delegation tree inside one org: a leader delegates by spawning a child scope and naming its leader ; authority is bounded to the leader's own subtree.
- Every scope rolls up to its parent, giving "report progress upward" a concrete home (the scope path chain).
- A thin per-membership trust score computed from verified contribution signals only, exposed per-user and as a scope / org leaderboard, with derived tier bands (contributor, ambassador, ...).

## Non-goals (this iteration)

- No full contribution-scoring engine (Rule / Signal / ScoreSnapshot) ; that is `phase-3/contribution-estimation.md`.
- No `Scope` to `Project` linkage and no structured `ScopeReport` "report upward" document yet ; foundation ships the tree and roll-up reads, structured reporting is a fast-follow.
- No per-scope RBAC (no `scopeId` on `RoleAssignment`) ; authority is a subtree walk plus the built-in ADMIN short-circuit.
- No invite-count or downline component in the trust score (kept out for anti-gaming ; revisit a decaying "active downline" bonus only if ambassadorship needs a nudge).
- Not nested sub-organizations ; the org stays flat, scopes provide the hierarchy.

## User stories

- **As a member**, when I invite someone and they join, they appear on my branch ; I can see my downline and my remaining invite quota.
- **As a scope leader**, I can create a child scope, name its leader, and add members ; I cannot act outside my own subtree.
- **As a Monark admin**, I can mint a join-route code for a student cohort that lands each redeemer in the right scope with the right role, capped by a max-uses and an expiry.
- **As a student**, I redeem a code and I am placed directly into my cohort's scope, no individual invite needed.
- **As a contributor**, my trust score rises when I contribute to projects, not when I invite people ; I can see where I stand on my scope's leaderboard.

## Architecture

Three modules, two of them new:

| Module                             | Tier     | Responsibility                                                                                                                                                    |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@monark/organizations` (existing) | core     | Invite **lineage** on membership ; invite **quotas** ; **JoinRoute** model + redemption.                                                                          |
| `@monark/scopes` (**new**)         | core     | The **delegation tree**: `Scope` nodes, scope membership, leader assignment, subtree-scoped authority. Core because it edits `schema.prisma` and is foundational. |
| `@monark/trust` (**new**)          | extended | **Thin trust score v1** over verified contribution. No schema edits ; stores computed scores in the metadata sidecar and recomputes from domain events.           |

The two graphs stay distinct:

- **Invite lineage** = `OrganizationMembership.invitedByMembershipId` self-pointer. Immutable ; answers "who brought whom in."
- **Delegation tree** = `Scope.parentScopeId`. Editable ; answers "who reports to whom and who leads what."

`@monark/trust` must not depend on `@monark/projects` (extended to extended is forbidden by the module boundaries) ; it consumes `project.*` domain events off the bus instead.

## Data model

### `@monark/organizations` (core ; edits `schema.prisma` under its banner)

- **`OrganizationMembership`**: add `invitedByMembershipId String?` with a self-relation (`invitedBy` / `invitees`), set inside the existing accept transaction (`acceptInviteRow`, `packages/organizations/src/server/data.ts:248`) from the inviter's membership in that org. Lineage is at membership grain to match `ProjectContributor`.
- **Invite quota**: a per-role default (config map in the module) with an optional per-membership override in the sidecar (`setOrganizationMetadataValue`, module `organizations`, key `invite-quota:<membershipId>`). Enforced at the top of `createInvite` (`packages/organizations/src/server/invites.ts:70`). No new model.
- **`JoinRoute`** (new):

```prisma
model JoinRoute {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  code           String       @unique              // human-typeable, e.g. "MRK-STUDENTS-F26"
  label          String
  roleId         String                            // role granted on redemption
  role           Role         @relation(fields: [roleId], references: [id], onDelete: Restrict)
  scopeId        String?                           // optional scope placement
  scope          Scope?       @relation(fields: [scopeId], references: [id], onDelete: SetNull)

  maxUses        Int?                              // null = unlimited
  usesCount      Int          @default(0)
  expiresAt      DateTime?
  disabledAt     DateTime?
  createdById    String

  @@index([organizationId])
}
```

Redemption mirrors `acceptInviteByToken`: creates membership + role assignment, places the joiner in `scopeId` when set, sets lineage to the route creator's membership (or null = route-attributed), increments `usesCount`, emits `organization.join-route-redeemed` and the existing `organization.member-joined`.

### `@monark/scopes` (new core ; scaffold with `pnpm gen:module`, register in `modules.manifest.ts` as `core`)

```prisma
model Scope {
  id                 String       @id @default(cuid())
  organizationId     String
  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  parentScopeId      String?
  parent             Scope?       @relation("ScopeTree", fields: [parentScopeId], references: [id], onDelete: Restrict)
  children           Scope[]      @relation("ScopeTree")

  name               String
  slug               String
  description        String?
  leaderMembershipId String?                       // denormalized for fast reads

  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  archivedAt         DateTime?

  members            ScopeMembership[]

  @@unique([organizationId, slug])
  @@index([parentScopeId])
}

model ScopeMembership {
  id           String   @id @default(cuid())
  scopeId      String
  scope        Scope    @relation(fields: [scopeId], references: [id], onDelete: Cascade)
  membershipId String                              // FK OrganizationMembership
  roleInScope  String                              // "LEADER" | "MEMBER" | "CONTRIBUTOR"
  createdAt    DateTime @default(now())

  @@unique([scopeId, membershipId])
  @@index([membershipId])
}
```

Root scopes have `parentScopeId = null`. `onDelete: Restrict` on the parent relation forces explicit re-parent / archive before removal.

### `@monark/trust` (new extended ; no `schema.prisma` edits)

Per-membership score stored via the sidecar:

```ts
setOrganizationMetadataValue({
  organizationId,
  module: "trust",
  key: `score:${membershipId}`,
  value: { score, components, tier, computedAt },
});
```

Read via `getOrganizationMetadataValue` / `listOrganizationMetadataForModule` (`packages/organizations/src/server/metadata.ts`). This value shape is intentionally the seed of `phase-3/contribution-estimation.md`: when the full engine lands, it graduates to real `ScoreSnapshot` tables.

## Server & behavior

- **Lineage**: extend `acceptInviteRow` and the join-route redemption to populate `invitedByMembershipId` ; add reads `getLineageAncestors(membershipId)` and `getDownline(membershipId)` for ambassador / downline views.
- **Quotas**: in `createInvite`, count the inviter's active (unaccepted, unexpired) + accepted invites in the org against the role quota ; throw a typed error when exceeded.
- **Join routes**: `createJoinRoute`, `listJoinRoutes`, `disableJoinRoute` (admin-gated), and `redeemJoinRoute(code, userId)` (public, validates `disabledAt` / `expiresAt` / `maxUses`).
- **Scope tree + delegation**: `createScope`, `createChildScope`, `assignScopeLeader`, `addScopeMember`, `moveScope`, `archiveScope`, plus reads `getScopeTree(orgId)` and `getScopePath(scopeId)`. Authority is enforced by a new guard **`requireScopeAuthority(ctx, scopeId)`**: the caller must be leader of that scope or any ancestor (walk `parentScopeId`), with ADMIN / SYSADMIN short-circuit (reuse the built-in-admin short-circuit in `packages/rbac/src/server/read.ts:83`). RBAC stays org-scoped for v1 ; no `scopeId` on `RoleAssignment`.
- **Trust (thin v1)**: a subscriber recomputes a membership's score from verified-contribution signals only, primarily `project.*` contribution events plus scope-activity events, and explicitly excludes invite counts. Recompute is best-effort on event plus a periodic recompute in `startBackgroundWork()` (`services/api/src/server.ts:152`). Exposes `trust.myScore`, `trust.membershipScore`, `trust.leaderboard(scopeId?)`. Tier / band is a derived label over the score, not stored authority.

## Extension-contract wiring (per `app/CLAUDE.md`)

Wire all `register*` calls into `services/api/src/server.ts` next to the existing blocks (permissions, event types, subscribers).

- **RBAC permissions**: `organizations.manage-join-routes` ; `scopes.create`, `scopes.delegate`, `scopes.manage-members`, `scopes.read` ; `trust.read`, `trust.read-leaderboard`. Every mutation gates through `requirePermission` (or `requireScopeAuthority` for subtree ops). While here, switch the existing invite procedures from the local `requireAdmin` to `requirePermission(ctx, "organizations.invite-member")`.
- **Event bus** (declare in each module's `contracts/events.ts`, register descriptions, run `pnpm gen:events`): `organization.join-route-redeemed` ; `scopes.scope-created`, `scopes.leader-assigned`, `scopes.member-added`, `scopes.scope-moved` ; `trust.score-changed`, `trust.tier-changed`.
- **Notifications** (en + fr, both required): "you were invited", "you were named leader of <scope>", "your trust tier changed". Prefer event subscribers over inline `notify()`.
- **Feature flags**: `scopes.enabled`, `trust.enabled` (incremental rollout + kill switch), checked with `isEnabled`.
- **Webhooks**: free once the event types are registered.

## Build order

1. **Lineage + invite quotas** in `@monark/organizations` (smallest ; unblocks "inviting grows your branch").
2. **`@monark/scopes`** core module: models, tree CRUD, `requireScopeAuthority`, delegation ops, events / flags / permissions.
3. **Join routes** in `@monark/organizations` (references `Scope` for placement, so after step 2).
4. **`@monark/trust`** extended module: sidecar storage, event subscribers, recompute + cron, `myScore` / `leaderboard`, tier-change notifications.
5. **Web surfaces**: invite-with-quota UI, scope-tree view + delegate action, "my downline", leaderboard. Each async surface ships a layout-accurate `Skeleton` and reuses the shared table / detail patterns (`DataTable`, `TableDetailLayout`).

## Reconciliation with existing specs

- Supersedes the flat / no-hierarchy / no-delegation non-goals in `phase-1/organization-management.md` and `phase-1/rbac-system.md`.
- `phase-2/referral-system.md` (single-level, external) is distinct ; lineage here is internal and multi-level. Do not build two attribution systems ; if the external referral integration ships, treat lineage as the internal graph and referral as the external attribution bridge.
- `@monark/trust` is the on-ramp to `phase-3/contribution-estimation.md`. `phase-3/voting-system.md`'s `eligibilityMinContributionScore` can read this score once it exists.

## Verification

- **Integration tests** (mirror `packages/organizations/tests/integration/invites.test.ts`):
  - lineage set on accept and on join-route redemption ; never re-parented.
  - quota enforced (invite blocked past role quota ; per-member override respected).
  - join route: happy path, expired, disabled, `maxUses` exhausted.
  - scope authority: a leader can create a child scope and name a sub-leader within their subtree ; a non-ancestor member cannot ; ADMIN can anywhere.
  - trust: a `project.*` contribution event recomputes the membership's score ; invite events do not move it ; leaderboard ordering is correct.
- **Manual E2E**: bootstrap org, build a small scope tree, invite a member (branch grows, quota decrements), redeem a student join route (lands in the right scope), contribute to a project, watch the trust score and leaderboard update.
- **Pre-PR gate**: `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers`.

## Deferred

- Full contribution-scoring engine (`phase-3/contribution-estimation.md`).
- `Scope` to `Project` linkage and a structured `ScopeReport` reporting cadence.
- Per-scope RBAC (`scopeId` on `RoleAssignment`).
- Decaying "active downline" trust bonus.
