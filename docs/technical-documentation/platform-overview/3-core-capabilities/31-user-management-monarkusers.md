# 3.1 User management (`@monark/users`)

Owns the `User` entity ; user ids are externally owned (Supabase Auth UUID for humans, `svc_`-prefixed for service accounts). `User` fields: `id`, `email` (unique), `emailVerifiedAt`, `displayName`, `avatarUrl`, `bannerUrl`, `bio`, `localePreference` (`en`/`fr`), `trustedDeviceTtlDays`, `deletedAt` (self-initiated grace delete), `disabledAt` (admin lockout), `kind` (`HUMAN` | `SERVICE`), `createdBy`. There is **no username/handle** ; public identity is `displayName` + `email`.

- **Read interface** (`server/read.ts`): `getById`, `getByIdOrThrow`, `getByEmail`, `getCurrent(ctx)` ; the canonical "who is this user" surface every module uses.
- **Metadata sidecar**: `UserMetadata`, identity `(userId, module, key)`, JSON value ; the sanctioned way for any module to attach per-user data without a migration, gated by `users.{read,write}-metadata-for-module-<module>` permissions.
- **tRPC** (`users.*`): `me`, `updateProfile` (displayName/avatar/banner/bio/locale ; bio ≤ 400 code points), `updateTrustedDeviceTtl`, `syncEmail`, `requestAccountDeletion` / `cancelAccountDeletion` (14-day grace), a `metadata.*` sub-router, and admin procedures (`adminListUsers`, `adminGetUser`, `adminUpdateProfile`, `adminRequestDeletion`/`adminCancelDeletion`).
- **Events**: `user.profile-updated`, `user.email-changed`, `user.deletion-requested`, `user.deletion-canceled`.
- **UI**: the `/account/*` shell (`profile`, `security`, `notifications`, `api-keys`, `danger`) ; the reusable `UserBanner` hero (shared by `/account/profile` and `/admin/users/[id]`).
