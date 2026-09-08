# 5. Reference

### 5.1 tRPC app router (14 sub-routers)

`apiKeys, auth, automation, calendar, dataModels, featureFlags, files, kanban, notifications, organizations, rbac, secrets, users, webhooks`. The Public API is the separate REST `/api/v1` surface (not a tRPC router).

### 5.2 Feature flags (as-is defaults)

| Flag                          | Default | Effect                                   |
| ----------------------------- | ------- | ---------------------------------------- |
| `tenancy.multi-tenant`        | off     | Multiple orgs vs single-tenant singleton |
| `auth.trusted-devices`        | on      | Trusted-device recognition               |
| `auth.totp-trust-devices`     | on      | Trusted devices skip the TOTP challenge  |
| `auth.totp-required-admin`    | on      | Admins must enroll TOTP                  |
| `data-models.query-language`  | off     | MQL query bar + saved views              |
| `automation.enabled`          | on      | Automation nav/editor/engine/worker      |
| `files.enabled`               | on      | `/admin/files`                           |
| `public-api.enabled`          | off     | The `/api/v1` surface                    |
| `public-api.service-accounts` | off     | Service-account keys                     |
| `kanban.board`                | on      | Kanban section                           |
| `kanban.query`                | off     | Kanban MQL board query bar               |

### 5.3 Background workers & cron

Webhook delivery (5s + `/cron/sweep-webhook-deliveries`), automation (5s, incl. schedule fires + `/cron/run-automation-schedules`), calendar reminder sweep (60s + `/cron/send-calendar-reminders`), account-deletion processing (`/cron/process-account-deletions`), flag-to-DB sync (boot), Data Model registration re-hydration (boot). Cron endpoints authenticate with `Authorization: Bearer $CRON_SECRET`.

### 5.4 Where to read more

Per-module `README.md` files ; and under this directory: `architecture.md` (architecture + project structure), `data-model-queries.md` (MQL), `automation.md` + `automation-data-flow.md`, `kanban.md`, `secrets.md`, `files.md`, `webhook-secret-resolver.md`, `identity-and-integration.md`.
