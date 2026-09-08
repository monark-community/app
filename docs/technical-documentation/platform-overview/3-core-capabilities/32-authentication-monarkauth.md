# 3.2 Authentication (`@monark/auth`)

Supabase Auth is the session source of truth ; the `User` table shadows `auth.users` 1:1 by UUID. The tRPC context reads the `Authorization: Bearer <token>`, verifies it with the Supabase admin client, and populates `{ userId, activeOrganizationId, requestId }` (active org flows from `user_metadata.active_organization_id`). The web client attaches the token via a single `httpBatchLink` and invalidates React Query on Supabase auth-state changes. Protected routes gate in `app/(authed)/layout.tsx` (bootstrap → session → trusted-device + `users.me` → deletion-grace lockdown).

- **Trusted devices** : cookie-identified (`monark_device_id`), only the SHA-256 hash stored ; per-device Supabase session revocation ; flag `auth.trusted-devices` (default on).
- **TOTP** : the app's own schema (not Supabase MFA) ; secrets AES-256-GCM at rest, recovery codes bcrypt-hashed ; two-step enrollment ; sign-in gate via a pending cookie + middleware redirect to `/signin/totp` ; flags `auth.totp-trust-devices`, `auth.totp-required-admin` (both default on).
- **tRPC** (`auth.*`): `session`, `signUp`, `checkPassword` (offline rules + HIBP k-anonymity, degrades open), `trustedDevices.*`, `totp.*`.
