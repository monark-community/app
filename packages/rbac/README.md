# @monark/rbac

The single source of truth for "what role does this user have in this org" and the permission matrix that maps roles to capabilities. Every other module gates write paths through `requirePermission` rather than comparing role strings inline.

Spec: [docs/features-planning/phase-1/rbac-system.md](../../docs/features-planning/phase-1/rbac-system.md).

## What's here

- `/contracts` — `registerPermissions` + dynamic registry helpers (`isKnownPermission`, `parsePermissionKey`, `listPermissionDescriptors`, `permissionsByCategory`, `getPermissionDef`), the role-key constants (`ADMIN_ROLE_KEY`, `SYSADMIN_ROLE_KEY`), and the per-event types under `RbacEvents`.
- `/server` — `rbacRouter` tRPC sub-router, read-interface (`hasRoleKey`, `hasPermission`, `getUserRoles`, `getAllAssignments`, `isLastAdmin`, `adminAssignmentSummary`), guards (`requireRoleKey`, `requirePermission`), write path (`assignRole`, `revokeRole`, `createRole`, `updateRole`, `deleteRole`), and the rbac module's own permission registration (`registerRbacPermissions`).
- `/client` — placeholder.

The Prisma schema gets the canonical `Role` enum and a `RoleAssignment` table under `// ── MODULE: rbac ──`. The migration also flipped `Invite.role` and `FeatureFlagOverride.role` from `String?` to the enum.

## Key concepts

- **Roles are table-driven.** Two reserved built-ins (`SYSADMIN` platform-tier, `ADMIN` org-tier) short-circuit `hasPermission` to true ; everything else is custom rows in the `Role` table per-org with their own permission set.
- **Permissions are runtime-registered.** Each module calls `registerPermissions("<module>", { "<key>": { description, category }})` at api boot. The DB stores `(roleId, module, permission)` ; two modules can claim the same permission slug without colliding because uniqueness is on the triple. Identity at call sites is the dotted form `"<module>.<key>"` (e.g. `"organizations.update-settings"`, `"posts.publish"`).
- **Capabilities, not roles.** Code checks `requirePermission(ctx, "organizations.update-settings")`, not `role.key === "ADMIN"`. New permissions show up in the /admin/rbac matrix automatically once their owning module registers them.
- **Guards return userId, not User.** `requireRoleKey` and `requirePermission` confirm the caller and throw `UnauthorizedError` / `ForbiddenError` ; they don't fetch the full user. Caller calls `@monark/users.getById(userId)` if they need the row.
- **SYSADMIN auto-grants across orgs.** `getUserRoles(userId, orgId)` and `findActiveAssignments` surface platform-tier SYSADMIN regardless of the org argument.

## Usage

```ts
// Server-side guard at the top of a tRPC mutation:
import { requirePermission } from "@monark/rbac/server"

myMutation: publicProcedure
  .input(...)
  .mutation(async ({ ctx, input }) => {
    const userId = await requirePermission(ctx, "organizations.update-settings")
    // ... work ...
  })
```

```ts
// Read interface from another module:
import { hasRoleKey, isLastAdmin, ADMIN_ROLE_KEY } from "@monark/rbac/server"

if (await hasRoleKey(userId, ADMIN_ROLE_KEY, orgId)) { /* ... */ }
if (await isLastAdmin(userId, orgId)) { /* block leaving */ }
```

```ts
// Extended-module permission registration (called once at api boot):
import { registerPermissions } from "@monark/rbac/server"

export function registerPostsPermissions(): void {
  registerPermissions("posts", {
    publish: { description: "Publish a draft to readers.", category: "posts" },
    moderate: { description: "Hide / unhide flagged posts.", category: "posts" },
  })
}
```

```ts
// Web side via tRPC:
const roles    = trpc.rbac.myRoles.useQuery()        // role rows
const allowed  = trpc.rbac.myPermissions.useQuery()  // dotted Permission[]
```

## Public API

| Import path                      | Export                  | Kind |
|----------------------------------|-------------------------|------|
| `@monark/rbac/server`            | `rbacRouter`            | tRPC sub-router mounted under `rbac.*` |
| `@monark/rbac/server`            | `hasRole(userId, role, orgId?)` | `Promise<boolean>`; throws if non-platform role lacks orgId |
| `@monark/rbac/server`            | `hasPermission(userId, permission, orgId?)` | `Promise<boolean>` |
| `@monark/rbac/server`            | `getUserRoles(userId, orgId?)` | `Promise<Role[]>` |
| `@monark/rbac/server`            | `primaryRole(userId, orgId)` | highest non-MONARK_ADMIN role |
| `@monark/rbac/server`            | `isLastAdmin(userId, orgId)` | helper for org-management |
| `@monark/rbac/server`            | `requireRole(ctx, role, orgId?)` | guard; throws `UnauthorizedError` / `ForbiddenError` |
| `@monark/rbac/server`            | `requirePermission(ctx, permission, orgId?)` | guard |
| `@monark/rbac/server`            | `assignRole({...})` | upserts assignment, emits `rbac.role-assigned` |
| `@monark/rbac/server`            | `revokeRole(id, revokedById, reason?)` | sets `revokedAt`, emits `rbac.role-revoked` |
| `@monark/rbac/contracts`         | `Role` (enum value), `Permission`, `PERMISSIONS`, event types | |

tRPC procedures under `rbac.*`:

| Procedure              | Input | Output |
|------------------------|-------|--------|
| `rbac.myRoles`         | —     | `Role[]` |
| `rbac.myPrimaryRole`   | —     | `Role \| null` |
| `rbac.myPermissions`   | —     | `Permission[]` |

## Dependencies

- `@monark/db` (Prisma + `Role` enum re-export)
- `@monark/common` (event bus, errors, tRPC primitives)

`@monark/rbac` deliberately does not depend on `@monark/users` or `@monark/organizations` — it works against raw `userId` / `organizationId` strings and lets callers hydrate the surrounding entities themselves.

## Operational

Prisma migration `20260424031451_add_rbac` adds the `Role` enum + `RoleAssignment` table and converts the `Invite.role` and `FeatureFlagOverride.role` columns to the enum. Applied with `pnpm --filter @monark/db exec prisma migrate dev`.

No seed data ships by default. The first MONARK_ADMIN is granted manually:

```ts
import { assignRole } from "@monark/rbac/server"

await assignRole({
  userId: "<your supabase user uuid>",
  role: "MONARK_ADMIN",
  grantedById: "system",
  reason: "bootstrap",
})
```

Run from a one-shot script in dev. In production this is a deploy-time operation; never bake superuser credentials into the seed file.

## Events emitted

| Event                  | When                                  | Status |
|------------------------|---------------------------------------|--------|
| `rbac.role-assigned`   | every `assignRole` call               | emitted |
| `rbac.role-revoked`    | every `revokeRole` call               | emitted |

Cross-org actions taken by a `MONARK_ADMIN` should be tagged in audit logs; that tagging hooks in once auth populates the session context.

## Events consumed

None yet. (Onboarding will subscribe to `rbac.role-assigned` to start role-specific flows; feature-flags caches will invalidate on the same event for any flag with a role-scoped override.)

## Deferred

- **Admin role-management UI** (`/<org>/admin/users/<userId>` role picker) — needs `@monark/components` form primitives + auth context.
- **Platform admin page** (`/admin/platform/users`) — MONARK_ADMIN-only; ships with the auth + admin shell.
- **`useRole()` hydration hook on the client** — currently `trpc.rbac.myRoles.useQuery()` is a network call; once auth lands and we hydrate roles into the layout, a context provider replaces it.
- **Per-request `cache()` wrapping** of `hasRole` / `hasPermission` — the spec calls for it; will add when we hit a render path that runs N permission checks.
- **ESLint rule forbidding inline `role === "ADMIN"`** comparisons outside the rbac module — added when the first violation appears in review.
- **Cross-org audit tag** for MONARK_ADMIN actions — wires in once `domain_events` persistence ships (currently the bus is in-memory only).
