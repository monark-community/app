---
type: reference
---

# Modules

Every feature module registered in `modules.manifest.ts`, with its tier. Core modules ship with every deployment; extended modules may depend on core but never on each other. See [Modules and tiers](../concepts/architecture/modules-and-tiers.md) for what the tiers mean.

<!-- source: modules.manifest.ts, services/api/src/trpc/app-router.generated.ts, packages/*/prisma/*.prisma -->

## Core modules (16)

| Package                 | Purpose                                                                                      | tRPC router     | Tables in     |
| ----------------------- | -------------------------------------------------------------------------------------------- | --------------- | ------------- |
| `@monark/api-keys`      | API keys and service accounts                                                                | `apiKeys`       | own fragment  |
| `@monark/auth`          | Sign-in glue for Supabase, social sign-in, two-factor, trusted devices, account deletion     | `auth`          | `base.prisma` |
| `@monark/automation`    | Event-triggered node-graph flows, the node registry, the run worker                          | `automation`    | `base.prisma` |
| `@monark/branding`      | The deployment's brand identity (name, colours, logo, sender address); configuration only    | none            | none          |
| `@monark/chat`          | Conversations and the in-app AI assistant                                                    | `chat`          | own fragment  |
| `@monark/data-models`   | Admin-defined models, fields and records; views; public forms                                | `dataModels`    | `base.prisma` |
| `@monark/feature-flags` | Flag registry, overrides and resolution                                                      | `featureFlags`  | `base.prisma` |
| `@monark/files`         | Signed uploads to private storage                                                            | `files`         | `base.prisma` |
| `@monark/notifications` | In-app and email notifications, preferences                                                  | `notifications` | `base.prisma` |
| `@monark/organizations` | The organization, membership, invitations, organization metadata                             | `organizations` | `base.prisma` |
| `@monark/public-api`    | The REST API under `/api/v1` and its OpenAPI document; a library, mounted by the API service | none (REST)     | none          |
| `@monark/rbac`          | Roles and permissions                                                                        | `rbac`          | `base.prisma` |
| `@monark/search`        | Global search across every registered search source                                          | `search`        | none          |
| `@monark/secrets`       | Encrypted, write-only per-organization secrets                                               | `secrets`       | `base.prisma` |
| `@monark/users`         | The user record, profile, user metadata                                                      | `users`         | `base.prisma` |
| `@monark/webhooks`      | Outbound webhooks: endpoints, subscriptions, the delivery outbox                             | `webhooks`      | `base.prisma` |

## Extended modules (8)

| Package                | Purpose                                               | Integrates           | tRPC router    | Tables in    |
| ---------------------- | ----------------------------------------------------- | -------------------- | -------------- | ------------ |
| `@monark/achievements` | Badges awarded automatically by event-driven rules    |                      | `achievements` | own fragment |
| `@monark/calendar`     | Calendars, events, reminders, events from data models |                      | `calendar`     | own fragment |
| `@monark/discord`      | Discord action nodes for automations                  | `@monark/automation` | none           | none         |
| `@monark/github`       | GitHub trigger events and action nodes                | `@monark/automation` | `github`       | none         |
| `@monark/kanban`       | Boards, columns and cards                             |                      | `kanban`       | own fragment |
| `@monark/telegram`     | Telegram trigger events and action nodes              | `@monark/automation` | `telegram`     | none         |
| `@monark/twitter`      | X (Twitter) action nodes                              | `@monark/automation` | `twitter`      | none         |
| `@monark/wiki`         | A tree of nested pages                                |                      | `wiki`         | own fragment |

## Infrastructure packages

Libraries under `packages/` that aren't in the manifest and have no tier: `@monark/common`, `@monark/components`, `@monark/db`, `@monark/integration-kit`, `@monark/query`, `@monark/shared`, `@monark/test-utils`. Their roles are listed in [Modules and tiers](../concepts/architecture/modules-and-tiers.md#infrastructure-packages).
