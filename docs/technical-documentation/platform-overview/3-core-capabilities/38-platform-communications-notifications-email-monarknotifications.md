# 3.8 Platform communications ; Notifications & email (`@monark/notifications`)

Two channels: **`IN_APP`** and **`EMAIL`**. Categories: `SECURITY`, `ACCOUNT`, `ACTIVITY`, `DIGEST`.

- **Kinds registry**: `registerNotificationKind(kind, def, messages)` with typed payloads via `NotificationDataRegistry` declaration merging, so `notify(kind, {userId}, data)` stays typed at call sites. Each kind declares category, channels, per-channel `defaultEnabled`, `requiredEmail` (forces EMAIL on for account-safety kinds), and a template. Ships **14 core kinds** ; extended modules add their own at boot.
- **Dispatch** (`notify`, never throws): resolves the kind, loads the user (service accounts skipped entirely), picks locale from `localePreference`, computes a dedupe key, and per channel applies the preference gate + a 60s dedupe window, persists a `Notification` row, and for EMAIL renders + wraps in the brand shell and sends via nodemailer (no `SMTP_URL` in dev → logs "would have sent"). Emits `notification.created` per row ; `notification.delivery-failed` on email failure.
- **Preferences**: sparse per-`(userId, kind, channel)` rows ; `requiredEmail` kinds are force-enabled regardless. tRPC (`notifications.*`): `unreadCount`, `list` (infinite), `markRead`/`markUnread`/`markAllRead`/`dismiss`, `preferences.{get,set,reset}` (+ admin variants).
- **UI**: the AppBar bell + right-side drawer (unread badge polled every 15s, unread/all tabs) and the `/account/notifications` per-kind EMAIL preference grid.
