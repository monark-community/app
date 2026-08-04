# @monark/notifications

Owns user-facing notifications across channels: email (SMTP via nodemailer) and in-app (persisted records surfaced through a header bell + inbox). Other modules emit domain events ; this module subscribes, resolves recipients + per-user prefs, renders branded templates per locale, and persists / transports the result.

Spec: [docs/features-planning/phase-1/notifications-system.md](../../docs/features-planning/phase-1/notifications-system.md).

## What's here (Phase 1 MVP)

- `/server` — `notify()` + `notifyMany()` dispatch surface, prefs CRUD (`isChannelEnabled`, `setPreference`, `listPreferences`, `resetPreferences`), `registerNotificationSubscribers()` for the api boot path, `registerCoreNotificationKinds()` (the core auth / account / webhook-operator kinds) + `registerNotificationKind()` (extension entrypoint), `notificationsRouter` tRPC sub-router (unread count, list, markRead, markUnread, markAllRead, dismiss, prefs.get/set/reset), and the email transport (`sendMail`).
- `/contracts` — `NotificationCreatedEvent`, `NotificationDeliveryFailedEvent`, `NotificationPreferenceChangedEvent` (unioned into `NotificationsEvents`), the runtime kind registry (`registerNotificationKind`, `getNotificationKindDef`, `listNotificationKinds`), and the `NotificationDataRegistry` interface that modules augment via TypeScript declaration merging to keep per-kind payloads typed.
- `/client` — placeholder ; the web service consumes the inbox via `trpc.notifications.*` directly. Centralised hooks land here when more than one site needs them.
- Templates under `src/templates/{auth,account,webhooks}/<kind>.ts` ; each kind ships en + fr slots with `subject` / `html` / `text` / `inapp { subject, body, link? }`. The brand chrome (orange header band, Monark wordmark, brand-orange CTA, footer) is appended at render time from `src/templates/_partials/email-shell.ts` so adding a new kind is "fill in the body slot."
- Prisma models `Notification`, `NotificationPreference`, enums `NotificationChannel`, `NotificationCategory` under the `// ── MODULE: notifications ──` banner in [packages/db/prisma/schema.prisma](../db/prisma/schema.prisma).

## Key concepts

- **Dispatch is best-effort.** `notify()` never throws. SMTP failures / template render errors land on the row as `failedAt` + `failureReason` and emit `notification.delivery-failed` ; the calling action (sign-in, password change, deletion request) was already committed and can't be rolled back by a notification problem.
- **SECURITY × EMAIL is forced on.** A `requiredEmail: true` kind ignores any opt-out row in `NotificationPreference`. Account-safety guarantee ; the prefs UI shows the row's email checkbox checked + disabled with a "required" hint.
- **Email is the only user-configurable channel.** The `/account/notifications` prefs UI exposes one email checkbox per event (kinds without an EMAIL channel are hidden) ; in-app delivery is platform-controlled and not user-toggleable. Kinds still declare `IN_APP` in `channels` / `defaultEnabled` — that governs whether the bell row is written, not a user choice.
- **Per-user preferences are sparse.** "No row" means "use the registry default." Rows are only inserted when the user explicitly toggles ; lets the registry default change without backfilling everyone.
- **In-app delivery is the row.** For `IN_APP`, persisting the `Notification` row IS the delivery — `readAt` / `dismissedAt` are user-action stamps. For `EMAIL`, the row is the audit trail (`deliveredAt` / `failedAt` / `failureReason`).
- **Soft-deleted users still get IN_APP, but no EMAIL.** Cancellation reminders need to surface inside the app. Outbound mail to a deactivated address would leak.
- **De-dup by data hash.** `notify()` skips if the same `(userId, kind, hash(data))` was delivered to the same channel within the last 60s. Catches double-fires from event-bus retries without forcing emitters to carry idempotency keys.
- **Locales come from `User.localePreference`.** `updateLocaleAction` mirrors the value into Supabase user_metadata too, so Supabase Auth's own emails (signup confirm, email change) match.
- **Templates get enriched vars, not just raw payload.** `notify()` runs the typed payload through [`enrichVars`](src/server/enrich.ts) before rendering. Every `Date` field K gains a `{{ K }}Formatted` companion (locale-aware via `Intl.DateTimeFormat`), every template can reference `{{ accountLink }}`, `{{ securityLink }}`, `{{ revokeLink }}`, `{{ signInLink }}`, `{{ appUrl }}` (built from `process.env.APP_URL` ; falls back to `BRANDING.appUrl`), and the brand surface vars `{{ appName }}`, `{{ tagline }}`, `{{ supportEmail }}`, `{{ brandPrimary }}`, `{{ brandAccent }}` come from `@monark/branding` so a template never hardcodes the product name or accent colour. Per-kind derivations live in an exhaustive `switch` ; e.g. `auth.new-device` derives `{{ deviceWhere }}` from country + ip (localised "Unknown location" / "Lieu inconnu" fallback), and `auth.signed-in` / `auth.device-revoked` fall a null `deviceLabel` back to a localised "a device" / "un appareil". When you add a kind that needs a derived var, add the case to the switch ; templates that reference an unknown token render it literally so authors notice immediately.

## Usage

```ts
// From another module's server code:
import { notify } from "@monark/notifications/server";

await notify("auth.password-changed", { userId }, { occurredAt: new Date() });
```

Most call sites won't reach `notify()` directly ; they emit a domain event and the subscriber registry forwards it. Add a new kind by :

1. **Type the payload.** Augment the `NotificationDataRegistry` interface with declaration merging so `notify()` stays typed at call sites :
   ```ts
   declare module "@monark/notifications/contracts" {
     interface NotificationDataRegistry {
       "posts.published": { postId: string; authorId: string; publishedAt: Date };
     }
   }
   ```
2. **Build the template messages.** Either inline the `KindMessages` object, or import a `templates/<area>/<kind>.ts` file matching the existing core templates' shape (en + fr slots with `subject` / `html` / `text` / `inapp { subject, body, link? }`).
3. **Register at api boot.** Add a `register<Module>NotificationKinds()` helper to your module's server package, calling `registerNotificationKind(kind, def, messages)`. Wire the helper into [services/api/src/server.ts](../../services/api/src/server.ts) next to `registerCoreNotificationKinds()`.
4. **Subscribe to a domain event** (optional). If a corresponding domain event already fires elsewhere, add a handler in [src/server/subscribers/index.ts](src/server/subscribers/index.ts) that calls `notify()` with the typed payload. Otherwise call `notify()` directly from the code path that has the data.

## Public API

| Import path                       | Export                                                                                              | Kind                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- |
| `@monark/notifications/server`    | `notify`, `notifyMany`                                                                              | function             |
| `@monark/notifications/server`    | `registerCoreNotificationKinds`, `registerNotificationKind`                                         | function             |
| `@monark/notifications/server`    | `registerNotificationSubscribers`                                                                   | function             |
| `@monark/notifications/server`    | `notificationsRouter`                                                                               | tRPC sub-router      |
| `@monark/notifications/server`    | `isChannelEnabled`, `setPreference`, `listPreferences`, `resetPreferences`, `resolveChannelEnabled` | function             |
| `@monark/notifications/server`    | `sendMail`                                                                                          | function (transport) |
| `@monark/notifications/contracts` | `NotificationKind`, `NotificationDataMap`, `NotificationDataRegistry`                               | type                 |
| `@monark/notifications/contracts` | `getNotificationKindDef`, `listNotificationKinds`, `listNotificationKindDescriptors`                | function             |
| `@monark/notifications/contracts` | `NotificationsEvents` (and members)                                                                 | type union           |

## tRPC surface

Mounted at `notifications.*` by the auto-generated [services/api/src/trpc/app-router.generated.ts](../../services/api/src/trpc/app-router.generated.ts):

- `notifications.unreadCount()` → `{ count }` for the header bell.
- `notifications.list({ cursor?, limit?, filter? })` → paged in-app rows.
- `notifications.markRead({ id })`, `notifications.markUnread({ id })`, `notifications.markAllRead()`, `notifications.dismiss({ id })`.
- `notifications.preferences.get()` → resolved per-kind × channel cells (each with `forced` + `available` flags), grouped by `category` in the UI.
- `notifications.preferences.set({ kind, channel, enabled })`, `notifications.preferences.reset()`, plus rbac-gated `adminGet` / `adminSet` / `adminReset` variants targeting another user.

## Subscribed events (Phase 1)

Wired in `registerNotificationSubscribers()` :

| Event                                      | Notification kind                                                |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `trusted-device.added`                     | `auth.new-device`                                                |
| `user.signed-in`                           | `auth.signed-in`                                                 |
| `user.password-changed`                    | `auth.password-changed`                                          |
| `totp.enabled`                             | `auth.totp-enabled`                                              |
| `totp.disabled`                            | `auth.totp-disabled`                                             |
| `totp.recovery-code-used`                  | `auth.recovery-code-used`                                        |
| `totp.recovery-codes-regenerated`          | `auth.recovery-codes-regenerated`                                |
| `trusted-device.revoked`                   | `auth.device-revoked` (skips bulk-sweep rows)                    |
| `trusted-devices.all-revoked`              | `auth.all-devices-revoked`                                       |
| `user.email-changed`                       | `account.email-changed`                                          |
| `user.deletion-requested`                  | `account.deletion-scheduled`                                     |
| `user.deletion-canceled`                   | `account.deletion-canceled`                                      |
| `webhook.delivery-failed`                  | `webhooks.delivery-permanently-failed` (permanent failures only) |
| `webhook.endpoint-disabled-after-failures` | `webhooks.endpoint-auto-disabled`                                |

## Out of scope (deferred)

- Push channel (web push, mobile push) ; same dispatch surface when added.
- Discord / Slack webhook channels ; same surface.
- Scheduled / batched dispatch (weekly digest cron). The kind + UI exist (DIGEST category) ; the cron lands later.
- Rich attachments (PDFs, ICS) ; HTML + text only at Phase 1.
- A real queue / retry layer ; in-process best-effort with audit row at Phase 1.
