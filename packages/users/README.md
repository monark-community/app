# @monark/users

Owns the `User` entity: profile data, account-level settings (later), and the canonical read interface every other module uses to answer "who is this user." Distinct from `@monark/auth` (credentials + sessions) and `@monark/rbac` (role assignments).

Spec: [docs/features-planning/phase-1/user-management.md](../../docs/features-planning/phase-1/user-management.md).

## What's here (Phase 1 MVP)

- `/server` — `usersRouter` tRPC sub-router with `me` (query) ; the self-service mutations `updateProfile`, `updateTrustedDeviceTtl`, `syncEmail`, `requestAccountDeletion`, `cancelAccountDeletion` ; the admin surface `adminListUsers`, `adminGetUser`, `adminUpdateProfile`, `adminRequestDeletion`, `adminCancelDeletion` ; and a `metadata` sub-router (list/get/set/delete) ; plus read-interface functions (`getById`, `getByIdOrThrow`, `getByEmail`, `getCurrent`).
- `/contracts` — `UserProfileUpdatedEvent`, `UserEmailChangedEvent`, `UserDeletionRequestedEvent`, `UserDeletionCanceledEvent` types unioned into `UsersEvents`.
- `/client` — placeholder; no UI components yet. The `/account` page that consumes this module lives in [`services/web/src/app/account`](../../services/web/src/app/account).

The Prisma schema has `User`, `UserMetadata`, `PendingEmailChange`, and `EmailResendAttempt` models under the `// ── MODULE: users ──` banner in [packages/db/prisma/schema.prisma](../db/prisma/schema.prisma).

## Key concepts

- **User.id is externally owned.** The primary key is a plain `String @id` (no `@default`). When `@monark/auth` signs a new user up through Supabase Auth, it inserts the `User` row using the Supabase-issued UUID. This module never generates ids.
- **`getCurrent(ctx)` is identity-only.** It takes a tRPC context and returns the user for `ctx.userId` or null. Until `@monark/auth` populates `ctx.userId` from a verified JWT, every caller gets null.
- **Soft-delete vs disable are separate states.** `deletedAt` is user-initiated (grace period applies; hard-delete cron eventually anonymizes). `disabledAt` is admin-initiated (indefinite; reversible). The soft-delete grace flow ships (`requestAccountDeletion` / `cancelAccountDeletion` stamp and clear `deletedAt`) ; only the hard-delete cron is still deferred.

## Usage

```ts
// From another module's server code:
import { getById, getCurrent } from "@monark/users/server";

const user = await getById("abc-123"); // or null
const me = await getCurrent({ userId }); // null when unauthenticated
```

```ts
// From the web side:
const { data } = trpc.users.me.useQuery();
// data is User | null; null until auth populates the session context.
```

## Public API

| Import path               | Export                                   | Kind                                                                    |
| ------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `@monark/users/server`    | `usersRouter`                            | tRPC router (mounted at `users.*`)                                      |
| `@monark/users/server`    | `getById(id)`                            | `(id: string) => Promise<User \| null>`                                 |
| `@monark/users/server`    | `getByIdOrThrow(id)`                     | throws `NotFoundError` if absent                                        |
| `@monark/users/server`    | `getByEmail(email)`                      | `(email: string) => Promise<User \| null>`                              |
| `@monark/users/server`    | `getCurrent(ctx)`                        | `({ userId }) => Promise<User \| null>`                                 |
| `@monark/users/server`    | `updateProfileData(id, patch)`           | profile writer (server-to-server; gate with `users.manage-profile`)     |
| `@monark/users/server`    | `setDisabledAt(id, date\|null)`          | admin disable / re-enable (server-to-server; gate with `users.disable`) |
| `@monark/users/server`    | `User`                                   | type from Prisma client                                                 |
| `@monark/users/contracts` | `UserProfileUpdatedEvent`, `UsersEvents` | event types                                                             |

tRPC procedures exposed under `users.*` (from the app router):

| Procedure                      | Input                                                               | Output                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `users.me`                     | —                                                                   | `User \| null`                                                                                                        |
| `users.updateProfile`          | `{ displayName?, avatarUrl?, bannerUrl?, bio?, localePreference? }` | `User` (mutation; pass `null` to clear a field)                                                                       |
| `users.syncEmail`              | `{ email }`                                                         | `User` (mutation; called from `/auth/confirm` after Supabase rotates `auth.users.email` on a `type=email_change` OTP) |
| `users.requestAccountDeletion` | —                                                                   | `{ deletionCompletesAt: Date }` (mutation; stamps `deletedAt = now`, 14-day grace)                                    |
| `users.cancelAccountDeletion`  | —                                                                   | void (mutation; clears `deletedAt` during grace)                                                                      |

## Dependencies

- `@monark/db` (Prisma)
- `@monark/common` (tRPC primitives, event emitter, `NotFoundError`, `UnauthorizedError`)
- `zod` (input validation on `updateProfile`)

## Operational

No env vars, seed steps, or cron setup for Phase 1 MVP.

Prisma migration `20260424025927_add_users` creates the `User` and `PendingEmailChange` tables. Runs with `pnpm --filter @monark/db exec prisma migrate dev` like any other migration.

## Events emitted

| Event                     | When                                        | Status                                                     |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `user.profile-updated`    | Any profile patch via `updateProfile`       | emitted; `changed` array lists the touched fields          |
| `user.email-changed`      | `syncEmail` flips the shadow `User.email`   | emitted; carries `previousEmail` + `newEmail`              |
| `user.deletion-requested` | `requestAccountDeletion` stamps `deletedAt` | emitted; carries `deletionCompletesAt` (= deletedAt + 14d) |
| `user.deletion-canceled`  | `cancelAccountDeletion` clears `deletedAt`  | emitted                                                    |

`user.email-changed` and `user.deletion-requested` / `user.deletion-canceled` already ship in the `UsersEvents` union (see the table above), and `user.deleted` is declared for the hard-delete worker ; only `user.disabled` / `user.enabled` remain specified-but-unadded.

## Events consumed

None yet.

## Deferred

All of these are spec'd but intentionally deferred to keep Phase 1's first pass buildable without `@monark/auth` or `@monark/rbac`:

- **Disable / enable** (`setDisabledAt`) is server-to-server only ; no admin tRPC procedure exposes it yet. Admin user-management otherwise shipped : `adminListUsers`, `adminGetUser`, `adminUpdateProfile`, `adminRequestDeletion`, and `adminCancelDeletion` are live, each gated by an `adminAssignmentSummary` admin check.
- **Hard-delete cron.** 14-day grace window runs now (deletedAt is stamped + surfaced), but the cron that anonymizes email/displayName/avatar + calls `supabase.auth.admin.deleteUser` isn't wired yet. Needs an ops-side scheduler pass (Vercel Cron / Supabase pg_cron / GitHub Actions).
- **Server-side avatar processing.** The Storage bucket + RLS policies are live, but crop-to-1:1 + resize-to-512 + WebP conversion via `sharp` are skipped for now. Images upload as-is (max 2 MB; JPEG / PNG / WebP); `object-fit: cover` in the UI handles non-square images gracefully. Revisit when Storage costs or thumbnail needs warrant it.
- **`PendingEmailChange` table.** Schema exists but unused in the current flow; email change goes through Supabase's native `auth.updateUser({ email })` and the `/auth/confirm?type=email_change` route. Kept for future admin-initiated change flows.
