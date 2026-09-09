# Routes worth knowing

You almost never type these (every link in the chrome takes you there) but they're stable and bookmarkable :

- `/` ; home.
- `/account` → `/account/profile` ; profile fields ; `/account/security` (email, password, TOTP, trusted devices), `/account/notifications` (preferences), `/account/api-keys` (personal API keys), `/account/danger` (schedule / cancel deletion).
- `/calendar` ; calendars and events (Day / Week / Month / Agenda).
- `/kanban` ; boards, columns, cards.
- `/automation` ; automation flows (node editor + run history).
- `/data/models/<modelKey>` ; records for an admin-defined Data Model.
- `/admin` ; the admin section ; redirects to its first tab. Tabs: `/admin/organizations`, `/admin/users`, `/admin/rbac`, `/admin/webhooks`, `/admin/data-models`, `/admin/files`, `/admin/secrets`, `/admin/service-accounts`.
- `/signin`, `/signup`, `/forgot-password` ; pre-auth surfaces.

Destinations behind a feature flag (Kanban, Automation, and the per-model Data surfaces) only appear (and only resolve) when the flag is on for you.
