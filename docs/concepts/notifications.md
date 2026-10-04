---
type: concept
---

# Notifications

Notifications are how Monark tells a person something: a sign-in from a new device, a card assigned to them, a record they follow changing. Every module sends them through one dispatch function, `notify()`, in `@monark/notifications`. A module declares a kind once at boot, and dispatch handles preferences, language, deduplication, storage and email for it.

## Kinds, channels and categories

A kind is one type of message, such as `auth.new-device` or `kanban.card.assigned`. Each kind declares:

- its channels: in-app, email, or both;
- whether each channel is on by default;
- its category: security, account, activity or digest, which groups it on the preferences page;
- its templates, in English and French;
- whether email is required, which forces email on whatever the user's preferences say. This is reserved for account-safety messages.

Core registers 14 kinds for security, account and webhook events. Extended modules register their own, such as calendar reminders and card assignments. The payload each kind expects is typed through declaration merging, so a wrong payload at a `notify()` call fails typecheck.

## What happens when a module calls notify()

1. Dispatch looks up the kind and the recipient. Service accounts are skipped: they have no inbox.
2. It picks the recipient's language and computes a deduplication key from the payload.
3. For each of the kind's channels it checks, in order: a user pending deletion gets in-app only; the user's preference for that kind and channel; and whether the same notification was already sent in the last 60 seconds.
4. It stores a `Notification` row per channel that passes.
5. For email, it renders the template inside the branded email shell (the organization's logo and colour, else the deployment's branding) and sends it over SMTP.
6. It emits `notification.created` per row, and `notification.delivery-failed` if sending fails.

Dispatch never throws. A failure is logged and recorded, so a notification problem can't roll back the sign-in or the save that caused it. Without `SMTP_URL`, as in local development, email is logged instead of sent.

## Events in, notifications out

Most notifications start as a [domain event](architecture/event-bus.md). A subscriber listens for the event, works out who should hear about it, and calls `notify()`. Security mail, for instance, comes from subscribers on `user.password-changed`, `totp.enabled` and similar events. That keeps the module that emits the event unaware of who gets told. Code calls `notify()` directly only when it already holds the data and no event fits.

## What the user sees

The in-app inbox lives in the user menu; the avatar shows the unread count, refreshed every 15 seconds. The user can filter to unread, mark notifications read or unread, and dismiss them.

Preferences are per kind and channel, and only the exceptions are stored: with no preference row, the kind's default applies. The preferences page lists email settings only; in-app notifications are always on. Kinds with required email can't be turned off.

## Limits

- Two channels only: in-app and email. There is no push or SMS.
- The inbox is polled, not pushed, so a new notification can take up to 15 seconds to appear.
- The digest category exists, but no kind sends digests yet.

## Related

- [Your account](../use/account/_index.md)
- [Domain events](../reference/events.md)
- [The extensibility contract](architecture/extensibility-contract.md)
- [Users and authentication](users-and-authentication.md)
