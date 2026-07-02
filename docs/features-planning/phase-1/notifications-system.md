# Notifications

## Context

Every other Phase 1 feature already wants to send notifications: the trusted-devices module emails the user on a new sign-in, the auth-email-validation flow gates "we'll email you" surfaces, the user-management spec carries a notifications-preferences skeleton that is explicitly stubbed pending this module. We've also already shipped two branded transactional emails (signup confirm, email change) and a one-off `mailer.ts` inside `@monark/auth/server` that everything else has been reaching into.

That ad-hoc shape is fine for two emails ; it falls apart by the third. Without a real notifications module:

- **Auth ends up owning a delivery channel** that has nothing to do with auth (`@monark/auth/server/mailer.ts`, `new-device-email.ts`). Cross-module imports leak through this seam.
- **There is no per-user preference layer**. A user can't say "stop sending me sign-in alerts" or "weekly digest, not realtime." Today our only knob is "do you have a verified email."
- **There is no in-app channel**. We can't surface "your password was changed 5 minutes ago" inside the app, only via email — useless for a user already signed in.
- **Templates live next to the code that triggers the send**, so the brand chrome (orange→red ring, Nunito Sans, locale branching) has to be rebuilt from scratch every time. We've done it once already and the next email will copy-paste from the first.

The notifications module fixes all four. It owns the channels (email, in-app, later: push), the per-user preferences, the template registry with brand chrome + locale branching, and the dispatch path that subscribes to domain events from other modules and routes them through user prefs to channels.

## Goals

- A single dispatch surface: any module emits a domain event, the notifications module decides which users to notify, on which channels, in which locale, and renders the right branded template.
- **Email channel**: SMTP-backed transport (`SMTP_URL`, falls back to log-only in dev), the brand chrome we already built for signup-confirm reused for every transactional email.
- **In-app channel**: persisted notifications surfaced in a header bell + popover inbox, with read / unread / dismiss state and per-user pagination.
- **Per-user preferences**, scoped per category × channel, edited from `/account?tab=notifications`. Security-category email cannot be disabled (compliance + account safety). Everything else is opt-out.
- **Template registry** owned by this module : one place to add a new transactional email, with en + fr branches and the brand shell (header band, wordmark, CTA button, code surface) baked in.
- **Audit trail**: every dispatched notification logs to a `NotificationDelivery` row (kind, recipient, channel, status, attempted_at). Required for "did the user actually get the email?" support questions.

## Non-goals

- **Not building an email marketing platform.** No campaign editor, no segmentation builder, no A/B subject lines. Marketing-style emails (weekly digest, announcements) ride the same dispatch path but are templated in code, not authored in a UI.
- **Not building a queue / retry infrastructure** at Phase 1. Delivery is best-effort in-process. A flag-gated upgrade to BullMQ + Redis (or equivalent) is reserved for the moment we genuinely need it ; before then, the volume doesn't justify the moving parts.
- **Not owning Supabase Auth's own emails** (sign-up confirm, magic link, recovery, email change). Those are templated in `supabase/templates/` and rendered by Supabase Auth on send. The notifications module owns _our_ transactional emails (new-device alert, password-changed alert, deletion-grace reminders, …) and the in-app channel.
- **Not push notifications at Phase 1.** Web push + mobile push land later, behind the same dispatch surface so call sites don't change.
- **Not Discord/Slack webhooks at Phase 1.** Same story ; same surface when added.
- **Not user-to-user messaging.** That's a product surface (DMs / mentions) ; notifications can carry the _alert_ about a mention but doesn't own message storage.

## User stories

- **As a returning user**, when something important happens to my account I see a red dot on the bell in the header and can read it without leaving the page.
- **As a privacy-conscious user**, I can opt out of marketing-style emails entirely while keeping security alerts on.
- **As an admin**, I can verify in the audit log whether a specific user was sent a specific notification, when, and via which channel.
- **As a developer adding a new feature**, I can register a new notification kind in one place (template + recipients + default channels + default opt-in) and have it work uniformly across email and in-app.
- **As a francophone user**, every notification I receive renders in French automatically because my `localePreference` is `fr`.

## Data model

```prisma
// One row per *delivered* notification (not per-event ; an event that fans
// out to 50 recipients writes 50 rows). Owns both the in-app surface and
// the audit trail for email/push channels (where `status` tracks the
// transport result rather than user interaction).
model Notification {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Stable string key from the registry, e.g. "auth.new-device",
  // "auth.password-changed", "account.deletion-scheduled". Used to look
  // up the template + the user's pref row.
  kind          String

  // Channel-specific fields. For "in-app", title/body/link are user-facing
  // strings already rendered in the user's locale at dispatch time. For
  // "email", the email body lives in the template ; we store the rendered
  // subject for the audit row.
  channel       NotificationChannel
  subject       String                    // rendered headline / email subject
  body          String?                   // rendered preview / first paragraph
  link          String?                   // optional deep-link into the app

  // In-app channel only ; null for email/push deliveries.
  readAt        DateTime?
  dismissedAt   DateTime?

  // Email/push channel ; null for in-app.
  deliveredAt   DateTime?
  failedAt      DateTime?
  failureReason String?

  createdAt     DateTime @default(now())

  @@index([userId, createdAt])
  @@index([userId, channel, readAt])
  @@index([kind, createdAt])
}

enum NotificationChannel {
  IN_APP
  EMAIL
  // PUSH       // reserved
  // DISCORD    // reserved
}

// Per-user × per-category × per-channel preferences. Categories are coarser
// than `kind` (one category groups many kinds, e.g. "security" covers
// new-device, password-changed, totp-enabled, totp-disabled). Users opt
// out at the category level ; per-kind opt-out is intentionally not
// supported (too noisy a UI for too little user value).
model NotificationPreference {
  id        String                @id @default(cuid())
  userId    String
  user      User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  category  NotificationCategory
  channel   NotificationChannel
  enabled   Boolean
  updatedAt DateTime              @updatedAt

  @@unique([userId, category, channel])
  @@index([userId])
}

enum NotificationCategory {
  SECURITY     // sign-ins, TOTP changes, password change ; email cannot be disabled
  ACCOUNT      // profile updates, email change, deletion grace warnings
  ACTIVITY     // Phase 2+ : votes you can take, contributions credited, mentions
  DIGEST       // Phase 2+ : weekly summary, off by default
}
```

Default rows are not pre-seeded ; we treat "no row" as "use the kind's `defaultEnabled` from the template registry," and only insert a row when the user explicitly toggles in `/account`. Keeps the table small and lets the registry default change without a backfill.

## Template registry

Templates live in code, not in the DB. Adding a notification kind is one PR :

```ts
// packages/notifications/src/registry.ts
export const NOTIFICATION_KINDS = {
  "auth.new-device": {
    category: "SECURITY",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: true, // SECURITY emails can't be opted out of
    template: "auth/new-device", // resolves to packages/notifications/src/templates/auth/new-device/{en,fr}.{html,txt,inapp}
  },
  "auth.password-changed": {
    category: "SECURITY",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: true,
    template: "auth/password-changed",
  },
  "account.deletion-scheduled": {
    category: "ACCOUNT",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: false,
    template: "account/deletion-scheduled",
  },
} as const satisfies Record<string, NotificationKindDef>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;
```

Each template directory ships :

```
packages/notifications/src/templates/auth/new-device/
  en.html        // brand chrome + content slots ; same shell as supabase/templates/confirmation.html
  en.txt         // plaintext fallback
  en.inapp.json  // { subject, body, link } template strings for the in-app channel
  fr.html
  fr.txt
  fr.inapp.json
```

The brand chrome (header band, Monark wordmark, CTA button, code-surface) is extracted into a shared partial so adding a new template is "fill in the body slot" rather than "rebuild the table layout."

## API surface

### Server — dispatch

```ts
// packages/notifications/src/server/dispatch.ts

// Single-user dispatch. Resolves the user's prefs + locale + email,
// renders the template per enabled channel, persists Notification rows,
// and triggers transports (email send, in-app no-op since the row IS
// the surface). Returns the IDs created so callers can correlate.
export async function notify<K extends NotificationKind>(
  kind: K,
  recipient: { userId: string },
  data: NotificationData<K>, // typed per-kind ; see registry
): Promise<{ deliveryIds: string[] }>;

// Fan-out to many users. Same path per recipient ; batches the DB write.
export async function notifyMany<K extends NotificationKind>(
  kind: K,
  recipients: Array<{ userId: string }>,
  data: NotificationData<K>,
): Promise<{ deliveryIds: string[] }>;
```

### Server — subscriber registry

The dispatch path is _imperative_ (some modules call `notify()` directly when they have richer per-recipient data), but most notifications are _event-driven_. The notifications module owns a thin subscriber layer that maps domain events → `notify()` calls :

```ts
// packages/notifications/src/server/subscribers.ts
export function registerNotificationSubscribers(): void {
  // Auth
  on<TrustedDeviceAddedEvent>("trusted-device.added", async (e) => {
    await notify(
      "auth.new-device",
      { userId: e.userId },
      {
        deviceLabel: e.deviceLabel,
        deviceCountry: e.country,
        deviceIp: e.ip,
        seenAt: e.occurredAt,
      },
    );
  });
  on<PasswordChangedEvent>("auth.password-changed", async (e) => {
    await notify(
      "auth.password-changed",
      { userId: e.userId },
      {
        occurredAt: e.occurredAt,
      },
    );
  });
  on<UserDeletionRequestedEvent>("user.deletion-requested", async (e) => {
    await notify(
      "account.deletion-scheduled",
      { userId: e.userId },
      {
        completesAt: e.deletionCompletesAt,
      },
    );
  });
  // … one entry per kind that's event-driven
}
```

Called once at api boot, alongside the other listener registrations.

### Server — read interface (for the in-app inbox)

```ts
// tRPC : notificationsRouter

notifications.unreadCount: () => Promise<{ count: number }>
notifications.list: (input: { cursor?: string; limit?: number }) =>
  Promise<{ items: NotificationListItem[]; nextCursor: string | null }>
notifications.markRead: (input: { id: string }) => Promise<void>
notifications.markAllRead: () => Promise<{ updated: number }>
notifications.dismiss: (input: { id: string }) => Promise<void>

// Preferences
notifications.preferences.get: () => Promise<NotificationPrefRow[]>
notifications.preferences.set: (input: {
  category: NotificationCategory
  channel: NotificationChannel
  enabled: boolean
}) => Promise<void>
```

### Client — hooks

```ts
// packages/notifications/src/client
export function useUnreadCount(): { count: number; isLoading: boolean };
export function useNotifications(): InfiniteQueryReturn<NotificationListItem>;
export function useNotificationPreferences(): { prefs; set; isLoading };
```

## UI flows

### Header bell + popover inbox

- Bell icon in the global header, with an unread-count badge (red, brand-orange-on-dark, capped at "9+") that reflects `unreadCount`.
- Click → popover : list of recent notifications (latest 20), each with subject + body + relative timestamp + optional deep-link CTA. "Mark all read" button. "Open inbox" link to `/account/notifications` for full pagination.
- Real-time updates : the popover invalidates `notifications.unreadCount` + the list query on `notifications.created` (delivered via the existing tRPC subscription channel) ; falling back to a 60s background poll when subscriptions aren't available.

### Notifications inbox (`/account/notifications`)

- Full list with filtering (Unread / All) and per-category filters.
- Each row has a "dismiss" affordance that hard-removes it from the list (sets `dismissedAt`).
- Empty state : "You're all caught up."

### Preferences (`/account?tab=notifications`)

- Table : rows = categories, columns = channels (Email, In-app).
- Toggles per cell. Security × Email cell shows a tooltip "Required for account safety" and is disabled.
- Reset to defaults button (clears all override rows ; reverts to the registry defaults).

## Dependencies

- **`users`** : recipient lookup (email, locale, displayName for greetings, deletedAt to skip dispatching to deleted accounts).
- **`feature-flags`** : `notifications.in-app` and `notifications.email` kill switches (default ON), plus future per-feature flags like `notifications.weekly-digest`.
- **`auth`** : the new-device email + password-changed email handlers move _out_ of `@monark/auth/server` and _into_ the notifications subscribers ; auth no longer depends on a mailer. (Auth still depends on `users`/`feature-flags` like the rest of the core.)
- **`@monark/common`** : event bus (`emit` / `on`), logger, error types.
- **External** : `nodemailer` for SMTP transport (already a dep of auth ; moves over).

The notifications module does **not** depend on extended modules ; extended modules depend on it (or rather, they emit events the notifications subscribers listen to ; no direct import either way).

## Integration points

### Exposed to other modules

```ts
// @monark/notifications/server
export { notify, notifyMany } from "./dispatch";
export type { NotificationKind, NotificationData } from "./registry";
export { registerNotificationSubscribers } from "./subscribers";

// @monark/notifications/contracts
export type {
  NotificationCreatedEvent,
  NotificationReadEvent,
  NotificationPreferenceChangedEvent,
} from "./events";

// @monark/notifications/client
export { useUnreadCount, useNotifications, useNotificationPreferences } from "./hooks";
```

### Events emitted

```ts
type NotificationCreatedEvent = DomainEventBase & {
  type: "notification.created";
  userId: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  notificationId: string;
};

type NotificationDeliveryFailedEvent = DomainEventBase & {
  type: "notification.delivery-failed";
  userId: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  notificationId: string;
  reason: string;
};
```

The `delivery-failed` event is what an ops dashboard / alerting subscribes to ; it's the signal that SMTP is down or a template is broken at render-time.

### Events subscribed to (Phase 1)

- `trusted-device.added` → `auth.new-device`
- `auth.password-changed` → `auth.password-changed`
- `auth.totp.enabled` → `auth.totp-enabled`
- `auth.totp.disabled` → `auth.totp-disabled`
- `user.deletion-requested` → `account.deletion-scheduled`
- `user.deletion-canceled` → `account.deletion-canceled`
- `user.email-changed` → `account.email-changed`

(Future, Phase 2+ : `referral.invited`, `voting.proposal-opened`, `contribution.credited`, …)

## Migration from the current shape

Concrete steps to land this without a flag day :

1. **Create `packages/notifications/`** with the schema above + dispatch surface + an empty subscriber registry.
2. **Move** `packages/auth/src/server/mailer.ts` → `packages/notifications/src/server/transport/email.ts`. Re-export from `@monark/auth/server` for one release as `/** @deprecated */` so consumers can migrate without a flag day.
3. **Move** `packages/auth/src/server/new-device-email.ts` into the notifications subscriber for `trusted-device.added`. Delete the now-unused `registerNewDeviceEmailListener` export from auth.
4. **Wrap the existing branded transactional templates** (`supabase/templates/confirmation.html`, `supabase/templates/email-change.html`) — _no actual move_ ; those stay in Supabase. But port the brand chrome partial into the notifications template directory so future _our_-side emails reuse the same shell.
5. **Add the in-app channel** : Notification table migration, header bell component, popover, inbox page, prefs page.
6. **Wire the rest of the Phase 1 subscribers** (password-changed, totp-enabled/disabled, deletion-scheduled, etc.) so the in-app inbox fills in for users.

Each step is independently shippable and can land behind `notifications.in-app` while in-flight.

## Edge cases

- **User has unverified email.** Email channel still attempts delivery (Supabase already let them sign up with the address ; if it bounces, the failure is logged but no in-app surface is created beyond the standard inbox row).
- **User soft-deleted (deletedAt set, in 14d grace).** Skip all email dispatch ; in-app dispatch still allowed so cancellation reminders surface inside the app. After hard-delete, the cascade on `User` removes their notification rows.
- **SMTP down.** `notify()` records the row with `failedAt` + `failureReason`, emits `notification.delivery-failed`, swallows the error so the calling event handler doesn't fail. (The original action — sign-in, password-change — already succeeded ; failing the notification dispatch can't roll it back.)
- **Template render error** (missing variable, malformed locale branch). Logged loudly, falls back to the en template ; if that also fails, the in-app row is created with a generic "Something happened on your account" subject so the user at least sees the affordance, and the failure event fires.
- **User toggles preference mid-dispatch.** Read prefs at dispatch time only ; we don't try to "respect" a toggle that flips during a fan-out. Eventual consistency is fine for this domain.
- **Locale changes between event emit and dispatch.** Dispatch reads the _current_ `localePreference` at send time, not the locale that was active when the event was emitted. Matches user intuition.
- **Duplicate dispatches** (e.g., two trusted-device.added events in quick succession from a retry). De-duplicate within a 60s window per `(userId, kind, hash(data))`. Keeps the inbox clean without needing a full idempotency-key contract from emitters.

## Risks

- **Notification fatigue.** Every new feature wants its own notification ; the inbox becomes noise and users disable everything. Mitigate by reviewing every new kind at the same gate as a copy review : does this _need_ to interrupt the user, or is it fine as a passive history entry? When in doubt, IN_APP only, no email.
- **Email reputation.** Sending too many low-value emails from `noreply@monark.io` tanks deliverability for the security emails that _do_ matter. Mitigate by gating non-security emails behind opt-in defaults at Phase 2 and by monitoring bounce / complaint rates.
- **Template drift.** Two engineers ship two templates with subtly different brand chrome because they each copy-pasted from a different reference. Mitigate by extracting the chrome into a shared partial _now_, before the third template lands.
- **Audit-log growth.** `Notification` rows accumulate forever if not pruned. Mitigate by a daily cron that hard-deletes rows older than 180 days (configurable per kind ; security retention is longer, marketing is shorter).
- **In-app inbox inconsistency in dev.** Without subscription support locally, a dev who triggers an event won't see the bell update until they refresh. Mitigate by hooking the bell badge into a window-focus refetch in addition to the polling fallback.

## Success metrics

- **Email deliverability**: bounce rate < 1%, complaint rate < 0.1% at steady state.
- **Notification preference engagement**: at least 30% of users have visited `/account?tab=notifications` within their first 30 days (indicates the surface is discoverable).
- **In-app inbox engagement**: median time-to-read for SECURITY notifications < 24 hours after delivery.
- **Template additions take < 1 PR**: the template partial + registry surface is sound when adding `notifications.*.new-kind` doesn't require touching dispatch / channels / chrome.
- **Zero "did the user get my email?" support tickets that can't be answered from `NotificationDelivery`**: the audit row exists and the `failedAt` / `failureReason` columns are populated when relevant.

## Implementation notes

- **Module package**: new workspace package `packages/notifications/` with the standard `/server`, `/client`, `/contracts` exports. Add to `transpilePackages` in `services/web/next.config.ts`.
- **Template engine**: use the same Go-template style we already use for Supabase templates (curly-brace placeholders + simple `{{ if eq … }}` for locale branches), implemented via a tiny in-house renderer over `String.replaceAll` and conditional blocks. We deliberately don't pull in `mjml` / `react-email` at this stage ; the brand chrome is small enough that the dependency cost outweighs the ergonomics. Revisit when the third template-author asks.
- **Locale**: always reads `User.localePreference` (kept current via `updateLocaleAction`'s mirror to Supabase user_metadata). Falls back to `en`.
- **In-app subscription channel**: tRPC v11 subscriptions over SSE in development, WebSocket in production behind a flag. Falls back to 60s polling when the connection is unavailable. Implementation reuses the same socket the (future) typing-indicators / live-vote-counts surface will run on ; no per-feature transport.
- **Brand chrome partial**: extract from `supabase/templates/confirmation.html` into `packages/notifications/src/templates/_partials/email-shell.html` ; both the Supabase templates and our future ones include it via a tiny `{{ include "_partials/email-shell" }}` directive that the renderer expands at build / send time.
- **Header bell**: shadcn `Popover` + `Badge` ; lucide `Bell` glyph. Lives in `services/web/src/components/notifications-bell.tsx` and is mounted in the global header next to the user menu.
- **Mailer move**: when relocating `mailer.ts`, keep the test file (`packages/auth/tests/mailer.test.ts`) and move it alongside ; the SMTP-detection + log-only fallback contract stays valid in the new home.

## Phase 1 dispatch table

The Phase 1 set of notification kinds and their default channel × pref matrix :

| Kind                         | Category | Email default | In-app default | Email overridable |
| ---------------------------- | -------- | ------------- | -------------- | ----------------- |
| `auth.new-device`            | SECURITY | on            | on             | no                |
| `auth.password-changed`      | SECURITY | on            | on             | no                |
| `auth.totp-enabled`          | SECURITY | on            | on             | no                |
| `auth.totp-disabled`         | SECURITY | on            | on             | no                |
| `account.email-changed`      | ACCOUNT  | on            | on             | yes               |
| `account.deletion-scheduled` | ACCOUNT  | on            | on             | yes               |
| `account.deletion-canceled`  | ACCOUNT  | on            | on             | yes               |

Anything Phase 2+ (referrals, voting, contributions, mentions) registers later in the same shape.

## Out of scope

- Push notifications (web push, mobile push) — same dispatch surface when added.
- Discord / Slack webhook channels — same dispatch surface when added.
- Notification grouping / threading ("3 new sign-ins from Chrome on macOS today"). Each event is its own row at Phase 1 ; revisit if the inbox gets noisy.
- Per-kind opt-out (only per-category at Phase 1 ; richer granularity if users actually ask for it).
- Scheduled / batched dispatch ("send weekly digest every Monday 8 AM"). The cron + queue infrastructure that needs lives behind a flag-gated upgrade.
- Notification templates with rich attachments (PDFs, ICS calendar invites). Email plain HTML + text only at Phase 1.
