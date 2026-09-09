# 2.2 Module tiers

Declared in `modules.manifest.ts`, enforced by `pnpm check:tiers`. **Core** modules ship with every deploy and may depend on each other + `@monark/db`/`@monark/common`. **Extended** modules add business features on top ; they may depend on core but **must not** depend on another extended module, edit core Prisma schema, mutate core registries directly, or rename/repurpose an existing event/flag/permission/notification kind.

| Module                  | Tier         | Purpose                                                 |
| ----------------------- | ------------ | ------------------------------------------------------- |
| `@monark/auth`          | core         | Supabase glue, TOTP, trusted devices, account lifecycle |
| `@monark/users`         | core         | The `User` entity + profile + metadata sidecar          |
| `@monark/organizations` | core         | Orgs, membership, invites, tenancy                      |
| `@monark/rbac`          | core         | Roles + granular permissions                            |
| `@monark/feature-flags` | core         | Runtime flag registration + resolution                  |
| `@monark/notifications` | core         | In-app + email dispatch                                 |
| `@monark/webhooks`      | core         | Outbound webhook outbox + delivery                      |
| `@monark/data-models`   | core         | Polymorphic, admin-defined record types                 |
| `@monark/automation`    | core         | Event-triggered node-graph flows                        |
| `@monark/secrets`       | core         | Per-org encrypted secret store                          |
| `@monark/api-keys`      | core         | API keys + service accounts                             |
| `@monark/public-api`    | core         | Curated REST `/api/v1` facade                           |
| `@monark/files`         | core         | Signed-upload file service                              |
| `@monark/branding`      | core         | Brand identity config                                   |
| `@monark/calendar`      | **extended** | Calendars, events, reminders, ICS                       |
| `@monark/kanban`        | **extended** | Boards, columns, cards                                  |
