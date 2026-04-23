# Referral System

## Context

The starter brief calls for "integration with an existing referral system." Two facts follow:

1. There's an **external** referral system (likely owned outside the app — Monark's community / growth tooling). We don't rebuild its business logic; we integrate.
2. We still need an **internal** representation: who referred whom, what code did they use, did the referral convert, can we emit that attribution back to the external system.

Referrals are a conversion surface, a rewards input for Phase 3 contribution-estimation, and a reporting surface for executives. The module's job is to capture attribution correctly and expose it.

## Goals

- Every signup can optionally carry a referral code; that code is resolved and attributed at signup time.
- Generate codes: any authenticated user with `referral:invite` permission gets a code shareable via link (`https://app.monark.com/?ref=CODE`).
- Integrate with the external referral system via a webhook protocol: we POST new referrals, we GET attribution details, we listen for "payout eligible" callbacks.
- Referrer sees their referral list in `/account/referrals`: invited, converted, pending, expired.
- Conversion is defined as "referred user verified their email + completed onboarding." Configurable via feature flag.
- Attribution is permanent: once attributed, not reassigned.

## Non-goals

- We don't pay rewards. Payouts are the external system's job; we signal eligibility and surface status.
- No multi-level / viral-referral chains. Attribution is single-level (referrer → referred; referred's own referrals attributed to them alone).
- No referral fraud detection beyond basic sanity checks (same IP + same device, for example). Heavy fraud handling lives in the external system.
- No in-app leaderboards / public referral rankings at Phase 2. Private per-user view only.

## User stories

- **As a developer**, I can grab my referral code from `/account/referrals`, copy the share link, and send it.
- **As a referred signer-upper**, my referral code is pre-filled from the URL and baked into my signup — no action required.
- **As a referrer**, I can see my referrals: who signed up with my code, their conversion status, estimated reward once eligible.
- **As a Monark admin**, I can see aggregate referral metrics and audit specific attributions.
- **As the external referral system**, I can query our API for conversions and hit our webhook to confirm payouts.

## Data model

```prisma
model ReferralCode {
  id          String   @id @default(cuid())
  ownerId    String
  owner      User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  code        String   @unique                    // short, human-typeable (e.g., "MRK-ALEX-Q4")
  createdAt   DateTime @default(now())
  disabledAt  DateTime?

  // Optional constraint: single-use or N-use
  maxUses     Int?                               // null = unlimited
  usesCount   Int      @default(0)

  // Which external campaign this code belongs to, if any
  externalCampaignId String?

  referrals   Referral[]
}

model Referral {
  id                  String   @id @default(cuid())
  codeId              String
  code                ReferralCode @relation(fields: [codeId], references: [id])

  referredUserId      String   @unique
  referredUser        User     @relation(fields: [referredUserId], references: [id], onDelete: Cascade)

  attributedAt        DateTime @default(now())
  convertedAt         DateTime?
  payoutEligibleAt    DateTime?                   // set by event consumer when conversion criteria met
  payoutConfirmedAt   DateTime?                   // set when external system acknowledges
  externalRecordId    String?                     // ID the external system returns

  @@index([codeId])
  @@index([referredUserId])
}
```

## API surface

### Self-service

```ts
// packages/referral/src/server/procedures/codes.ts

"use server"
export async function getOrCreateMyCode(): Promise<ReferralCode>
//   Idempotent: if the user has a code, returns it; else generates.

"use server"
export async function disableCode(codeId: string): Promise<void>

// Read
export async function listMyReferrals(opts?: {
  status?: "pending" | "converted" | "paid"
}): Promise<ReferralView[]>
```

### Attribution (called from signup)

```ts
// packages/referral/src/server/procedures/attribute.ts
export async function attributeSignup(params: {
  referredUserId: string
  referralCode?: string
}): Promise<Referral | null>
//   Internal function, not a server action — called from the signup
//   server action after the user is created. Returns null if no code
//   or an invalid/exhausted code (signup succeeds regardless).
```

### Admin

```ts
"use server"
export async function listReferralsAdmin(filter: {
  orgId?: string
  status?: string
  dateRange?: { from: Date; to: Date }
}): Promise<PaginatedReferrals>
//   RBAC: 'referral:admin' permission.
```

### External integration

```ts
// packages/referral/src/server/webhooks/external.ts  (route handler at /api/webhooks/referral)
export async function POST(request: Request) {
  // HMAC-verify the payload (shared secret from env var)
  // Handle event types: "payout-confirmed", "payout-rejected", "campaign-updated"
}
```

And outbound — whenever a referral is conversion-eligible:

```ts
// packages/referral/src/server/data/external.ts
export async function notifyExternalSystem(
  referralId: string,
  eventType: "attribution-created" | "conversion" | "payout-requested"
): Promise<void>
```

## UI flows

### Claim code on signup (`/signup?ref=CODE`)

- Signup form hidden field pre-filled from `ref` query param.
- If the code is invalid (syntactically or doesn't exist), signup still works; we silently drop the referral.
- On successful signup, `attributeSignup` runs. If the code is valid and has remaining uses, a `Referral` is created.

### Referral dashboard (`/account/referrals`)

- Hero: your code + copyable share link + QR code.
- "Invite via email" form: enter email(s), we send a canned message with their code embedded. Ties into `organizations` invite flow if the current org has referral enabled for invites.
- Table of referrals: referred user (avatar + email), signup date, conversion status, estimated reward (if known).

### Admin referrals (`/admin/referrals`)

- Aggregate metrics: total codes, total referrals, conversion rate, payout rate over time.
- Table view with filter/search.
- Drill-down into any referral: full audit trail.
- "Push to external" action: retry external sync if a referral is stuck in "attribution-created but not acknowledged."

## Dependencies

- `auth`: referral code pre-fill on signup form reads from URL before auth.
- `users`: referrer and referred are users.
- `rbac`: `referral:invite` permission gates code generation. `referral:admin` gates the admin view.
- `organizations`: referrals may be scoped per org (optional, via `externalCampaignId` aligning to org).
- `feature-flags`: `referral.external-sync` toggles outbound webhook traffic (useful during external-system outages).
- `auth-email-validation` (Phase 1): conversion event listens to email verification.
- `onboarding` (Phase 2): conversion event also listens to `onboarding.completed`.

## Integration points

### Events emitted

```ts
export const REFERRAL_ATTRIBUTED = "referral.attributed"
export const REFERRAL_CONVERTED = "referral.converted"
export const REFERRAL_PAYOUT_ELIGIBLE = "referral.payout-eligible"
export const REFERRAL_PAYOUT_CONFIRMED = "referral.payout-confirmed"

export type ReferralConvertedEvent = {
  referralId: string
  codeId: string
  referrerId: string
  referredUserId: string
  at: Date
}
```

Contribution-estimation (Phase 3) listens to `REFERRAL_CONVERTED` and allocates contribution points to the referrer.

### Events consumed

- `user.signed-up` — if the signup carries a referralCode, call `attributeSignup`.
- `user.email-verified` — check if this user has a `Referral`; if yes and all conversion criteria met (verified + onboarded), mark `convertedAt` and emit.
- `onboarding.completed` — same; last of the two criteria flips the switch.

### External system contract

Defined in `packages/referral/src/server/domain/external-schema.ts` — a Zod schema for both outbound and inbound payloads. Versioned (`v1`) in the URL. The external system provides the spec; we mirror it here so inbound payloads are validated before touching DB.

Outbound payload on attribution:

```json
{
  "type": "attribution-created",
  "referralId": "cuid...",
  "referrerId": "uuid...",
  "referredUserId": "uuid...",
  "code": "MRK-ALEX-Q4",
  "campaignId": "fall-2026",
  "at": "2026-04-21T..."
}
```

Inbound on payout:

```json
{
  "type": "payout-confirmed",
  "referralId": "cuid...",
  "externalRecordId": "ext-abc-123",
  "amount": 100,
  "currency": "USD",
  "at": "..."
}
```

## Edge cases

- **Referral code from a now-deleted user.** `Referral` keeps the `codeId`; admin view shows "referrer deleted" but the referred user's signup isn't affected. Rewards flow to no one (the external system decides to void or reassign).
- **Self-referral.** Block: a user's own code used during their own signup is treated as "no code" with a logged attempt. No ban, no penalty — just silent drop.
- **Same email tries to sign up twice using different codes.** Only the first attribution sticks (User is unique by email). Second signup fails on existing email (as usual).
- **Code that exceeds `maxUses` mid-flight.** Atomic check-and-increment in the attribution function using a `update ... where usesCount < maxUses returning` pattern.
- **External system returns error on push.** Retry with exponential backoff up to 5 times, then park in an `external_sync_failures` table for admin action. Don't let the user signup fail because of it.

## Risks

- **External system spec changes.** We own nothing on their side. Wrap the contract in versioned Zod schemas; when they bump `v2`, we ship a migration side-by-side.
- **Attribution fraud.** Creative users sign up dummy accounts with their own code from a VPN. Mitigate with obvious checks (same device, rapid-fire signups from same IP) and flag for admin review, not auto-ban.
- **Privacy.** The referrer sees their referrals' emails. We're intentional: this is consistent with standard referral UX. Document in the privacy policy.

## Success metrics

- Signup → conversion rate for referred users vs. organic baseline.
- % of active users with at least one referral.
- Referral conversion funnel: attributed → verified → onboarded → payout-eligible → paid.
- External sync success rate (should be > 99%).

## Implementation notes

- Codes are generated from a dictionary + user-handle slug to stay human-readable (`MRK-ALEX-Q4`). Avoid confusable characters (0/O, 1/l).
- Conversion eligibility check is centralized: `isConversionEligible(referralId)` does the AND of criteria; update criteria in one place when rules change.
- Webhook endpoint requires HMAC signature verification; reject unsigned / stale requests (> 5 min skew).
- External sync uses an idempotency key derived from `referralId + eventType` so retries are safe on their end.

## Out of scope

- Payout UI (reward math is external; we only display status)
- Multi-level referrals
- Public leaderboards
- Referral campaign configuration UI (campaigns come from the external system)
- Custom reward tiers per code (external system's job)
