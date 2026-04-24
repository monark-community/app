# @monark/users

Owns the `User` entity: profile data, account-level settings (later), and the canonical read interface every other module uses to answer "who is this user." Distinct from `@monark/auth` (credentials + sessions) and `@monark/rbac` (role assignments).

Spec: [docs/features-planning/phase-1/user-management.md](../../docs/features-planning/phase-1/user-management.md).

## What's here (Phase 1 MVP)

- `/server` — `usersRouter` tRPC sub-router, read-interface functions (`getById`, `getByIdOrThrow`, `getByEmail`, `getCurrent`).
- `/contracts` — `UserProfileUpdatedEvent` type; re-exported from `UsersEvents` for the domain-event union.
- `/client` — placeholder; no UI components yet.

The Prisma schema has `User` and `PendingEmailChange` models under the `// ── MODULE: users ──` banner in [packages/db/prisma/schema.prisma](../db/prisma/schema.prisma).

## Key concepts

- **User.id is externally owned.** The primary key is a plain `String @id` (no `@default`). When `@monark/auth` signs a new user up through Supabase Auth, it inserts the `User` row using the Supabase-issued UUID. This module never generates ids.
- **`getCurrent(ctx)` is identity-only.** It takes a tRPC context and returns the user for `ctx.userId` or null. Until `@monark/auth` populates `ctx.userId` from a verified JWT, every caller gets null.
- **Soft-delete vs disable are separate states.** `deletedAt` is user-initiated (grace period applies; hard-delete cron eventually anonymizes). `disabledAt` is admin-initiated (indefinite; reversible). Neither lands in Phase 1 MVP.

## Usage

```ts
// From another module's server code:
import { getById, getCurrent } from "@monark/users/server"

const user = await getById("abc-123")          // or null
const me   = await getCurrent({ userId })      // null when unauthenticated
```

```ts
// From the web side:
const { data } = trpc.users.me.useQuery()
// data is User | null; null until auth populates the session context.
```

## Public API

| Import path                       | Export               | Kind       |
|-----------------------------------|----------------------|------------|
| `@monark/users/server`            | `usersRouter`        | tRPC router (mounted at `users.*`) |
| `@monark/users/server`            | `getById(id)`        | `(id: string) => Promise<User \| null>` |
| `@monark/users/server`            | `getByIdOrThrow(id)` | throws `NotFoundError` if absent |
| `@monark/users/server`            | `getByEmail(email)`  | `(email: string) => Promise<User \| null>` |
| `@monark/users/server`            | `getCurrent(ctx)`    | `({ userId }) => Promise<User \| null>` |
| `@monark/users/server`            | `User`               | type from Prisma client |
| `@monark/users/contracts`         | `UserProfileUpdatedEvent`, `UsersEvents` | event types |

tRPC procedures exposed under `users.*` (from the app router):

| Procedure    | Input | Output          |
|--------------|-------|-----------------|
| `users.me`   | —     | `User \| null`  |

## Dependencies

- `@monark/db` (Prisma)
- `@monark/common` (tRPC primitives, `NotFoundError`)

## Operational

No env vars, seed steps, or cron setup for Phase 1 MVP.

Prisma migration `20260424025927_add_users` creates the `User` and `PendingEmailChange` tables. Runs with `pnpm --filter @monark/db exec prisma migrate dev` like any other migration.

## Events emitted

| Event                       | When                                                | Status |
|-----------------------------|-----------------------------------------------------|--------|
| `user.profile-updated`      | Any profile patch via `updateProfile`               | type declared, not yet emitted (profile-edit ships with auth) |

Additional events (`user.email-changed`, `user.deletion-*`, `user.disabled`, `user.enabled`) are specified in the planning doc and will be added to the `UsersEvents` union as their flows ship.

## Events consumed

None yet.

## Deferred

All of these are spec'd but intentionally deferred to keep Phase 1's first pass buildable without `@monark/auth` or `@monark/rbac`:

- **Profile edit** (`updateProfile`, `uploadAvatar`). Requires an authenticated session context. Lands when `@monark/auth` wires JWT verification into tRPC context.
- **Email change flow** (`requestEmailChange`, `confirmEmailChange`). Shares the token-email pattern with `@monark/auth`'s email-validation feature; will be built together.
- **Account deletion** (`requestAccountDeletion`, `cancelAccountDeletion`, hard-delete cron). Grace-period semantics + anonymization logic ship in their own pass.
- **Admin operations** (`listOrgMembers`, `disableUser`, `enableUser`). Every one requires `@monark/rbac`'s `requireRole("admin")` guard; ships after rbac.
- **Avatar upload** (`uploadAvatar`). Needs Supabase Storage bucket configured + `sharp` image processing. Off the critical path.
- **Profile UI page** (`/account/profile`). The feature-planning spec describes this; the `@monark/components` surface it depends on (shadcn form primitives, avatar control) hasn't been pulled in yet.
