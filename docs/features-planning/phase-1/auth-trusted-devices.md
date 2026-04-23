# Auth — Trusted Devices

## Context

Trusted-device tracking is what lets us reduce auth friction for recurring users while catching suspicious sign-ins. When a user signs in on a new device, we capture enough signal (not a fingerprint, deliberately) to recognize that device on future sign-ins, skip TOTP, and surface "signed in from a new device" notifications to the user.

The starter brief lists "Trusted Device" as part of the auth flow. What it means in practice is a combination of (1) a cookie-based device identifier, (2) a user-visible list of active devices, and (3) the ability to revoke any of them.

## Goals

- When a user signs in, we persist a device record linked to their user, tagged with metadata (UA-derived OS/browser, first-seen IP, country if we can resolve it).
- The device is assigned a long-lived `device_id` cookie (HTTP-only, secure, `SameSite=Lax`).
- On subsequent sign-ins with the same `device_id`, we mark the device as "recognized" and skip the TOTP step (see `auth-totp.md` for how the two interact).
- The user can view all their active devices at `/account/security/devices` and revoke any of them (instantly invalidates that device's sessions).
- Signing in from a new, unrecognized device triggers a notification email ("New sign-in from Chrome on macOS in Montreal, Canada").

## Non-goals

- Not fingerprinting. We never use canvas, audio, font, or WebGL signals. The cookie is the identity; everything else is descriptive metadata for the user's dashboard.
- Not attempting to persistently identify a device across multiple browsers or incognito sessions.
- Not building risk-scoring. If the user revokes a device, it's gone; we don't try to "upgrade" a device's trust over time beyond the initial recognition.

## User stories

- **As a returning user**, I can sign in from my usual laptop without being prompted for TOTP every time.
- **As a security-conscious user**, I can see every active device on my account and remove any I don't recognize.
- **As a user whose laptop was stolen**, I can revoke that device from my phone; sessions on it die immediately.
- **As a user**, I get an email when my account is accessed from a device I haven't used before, with a clear "that wasn't me" link that sends me to the revocation flow.

## Data model

```prisma
model TrustedDevice {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  label         String                            // e.g., "Chrome on macOS"; user-editable
  userAgent     String
  firstSeenIp   String
  firstSeenAt   DateTime @default(now())
  lastSeenIp    String
  lastSeenAt    DateTime @default(now())
  country       String?                           // resolved via the Vercel / Supabase edge geo
  revokedAt     DateTime?

  // Cookie value is hashed before storage; the raw value is never persisted.
  cookieHash    String   @unique

  @@index([userId])
  @@index([cookieHash])
}
```

The `cookieHash` is a SHA-256 of a cryptographically random 32-byte value; we send the raw value to the client and keep only the hash.

## API surface

Internal (called by `auth/sign-in`):

```ts
// packages/auth/src/server/domain/trusted-devices.ts

export async function recognizeOrRegister(
  userId: string,
  request: Request
): Promise<{ device: TrustedDevice; isNew: boolean }>
//   Reads the device_id cookie. If present and matches a live (non-revoked)
//   record for this user, updates lastSeen* and returns { isNew: false }.
//   Otherwise generates a new cookie, persists a new TrustedDevice,
//   returns { isNew: true }.
```

Public (server actions on the security page):

```ts
"use server"
export async function listMyDevices(): Promise<TrustedDeviceView[]>
//   Returns the user's non-revoked devices plus "current" flag
//   indicating which one this request came from.

"use server"
export async function revokeDevice(deviceId: string): Promise<void>
//   Soft-deletes (stamps revokedAt) and revokes all Supabase sessions
//   tied to this device's cookie.

"use server"
export async function renameDevice(deviceId: string, label: string): Promise<void>
```

## UI flows

### Sign-in (new device)

1. User signs in successfully with password (+ TOTP if enabled).
2. `recognizeOrRegister` fires; `isNew === true`.
3. We set a `device_id` cookie (`Max-Age` 400 days, HTTP-only, secure, `SameSite=Lax`, `Path=/`).
4. Emit `trusted-device.added` event.
5. An email goes out to the user: "New sign-in from Chrome on macOS from Montreal, Canada at 14:32 UTC. If that wasn't you, [revoke this device]."

### Sign-in (known device)

1. `recognizeOrRegister` finds the cookie and matches.
2. Updates `lastSeenAt`, `lastSeenIp`. No email.
3. If TOTP is enabled, the trusted-device match skips TOTP for this sign-in (configurable; see `auth-totp.md`).

### Security page (`/account/security/devices`)

- Table of devices: label (editable), OS/browser, location (last known), first seen, last seen, "revoke" button.
- The current device is highlighted and cannot be revoked from the page itself (prevents the "I just locked myself out" footgun — if they really want to, they sign out and revoke from another session).
- "Revoke all other devices" bulk action with confirmation.

### New-device email

- Subject: "New sign-in on Monark"
- Body: device label, approximate location, time, primary CTA "That wasn't me → revoke" linking to `/account/security/devices?highlight=<deviceId>`.
- Sent via Supabase's SMTP config or Resend.

## Dependencies

- `auth-login-password`: called into from sign-in; session binding.
- `auth-totp`: consulted on whether to skip TOTP for a known device.
- `users`: device records hang off `User`.
- `feature-flags`: `auth.trusted-devices` can disable the whole flow if something's misbehaving in prod.
- External: IP geolocation (Vercel's edge middleware exposes it; Supabase doesn't). If self-hosting, use an ip-to-country database.

## Integration points

### Events emitted

```ts
export const TRUSTED_DEVICE_ADDED = "trusted-device.added"
export const TRUSTED_DEVICE_REVOKED = "trusted-device.revoked"

export type TrustedDeviceAddedEvent = {
  userId: string
  deviceId: string
  userAgent: string
  country?: string
  at: Date
}
```

The TOTP module subscribes internally (no event boundary; same core) to refresh cached "does this user+device need TOTP?" logic.

### Cookie contract

The cookie is opaque to other modules. Only the trusted-devices code reads/writes it. Other modules that care (TOTP, sign-in) query `recognizeOrRegister` or equivalent helpers.

## Edge cases

- **Shared computer sign-out.** The user signs out; we don't clear the `device_id` cookie (device is still theirs, tied to their user ID). When they sign back in, we recognize them. If they want it gone, they revoke from the security page.
- **Multiple users on the same device.** Each user gets their own device record keyed by `(userId, cookieHash)`. The cookie is the same value but records are separate.
- **Cookie cleared.** Next sign-in registers a new device. The old record stays with its `lastSeenAt` frozen; user can manually clean up from the dashboard. After 180 days of inactivity, a background job revokes stale records.
- **IP changes.** Users move around. We update `lastSeenIp` / `country` on every recognized sign-in but don't alert on IP change alone; only new-device events alert.
- **Revocation race.** User revokes device A from device B; device A has a live request in flight. The request completes with the existing session, but the next request fails because Supabase sessions tied to A are killed. Acceptable — revocation is authoritative.

## Risks

- **Cookie theft leads to session hijacking.** We mitigate by making the cookie HTTP-only + secure + `SameSite=Lax`; Supabase sessions are the real auth bearer, not the device cookie. The device cookie only affects TOTP-skip decisions. Someone who steals the device cookie but not a Supabase session has nothing to do with it.
- **Email deliverability for new-device alerts.** If the alert email fails, the user may not learn of unauthorized access. Queue these through a reliable transactional provider (Resend, Postmark); log failures to a table we actively monitor.
- **User misreads an alert and revokes their own device.** Mild inconvenience; they re-sign-in and a new record appears. Worst case is extra TOTP prompts for a day.

## Success metrics

- Fraction of sign-ins on recognized devices (target > 85% after 60 days in production).
- Time from new-device email to user click on "revoke" (short tail → working; long tail → either unused or confusing).
- Support tickets about "suspicious activity" — track volume.

## Implementation notes

- The `device_id` cookie is set from the sign-in server action's response headers. In Next 16, use `cookies().set(...)` inside the action; no middleware magic needed.
- UA parsing: use `ua-parser-js` (tiny, battle-tested). Store the raw UA too so we can re-parse if we ever want to.
- IP: `request.headers.get("x-forwarded-for")` on Vercel; on Supabase Edge Functions the IP is in the request metadata. Centralize in `services/api/src/lib/request-context.ts`.
- Device revocation needs to call `supabase.auth.admin.signOut(userId, { scope: ... })` — we need a per-device scope. Since Supabase doesn't natively key sessions by our device_id, we maintain a join table `DeviceSession(deviceId, supabaseSessionId)` and revoke specifically the sessions we know about. Alternatively, scope `global` and let the user re-sign-in everywhere; simpler but blunter. Phase 1 starts blunt, Phase 1.1 refines.

## Out of scope

- Passkey / WebAuthn support (future; would make this module less relevant by removing the need for password-only sessions)
- Risk scoring / velocity checks (different country in under 10 minutes, etc.)
- Device-specific permissions ("this device can browse but not write")
- Admin-driven revocation across the org (belongs in `user-management.md`)
