---
type: concept
---

# Platform overview

Monark is a business-application platform: one TypeScript codebase that gives an organization identity, permissions, its own databases, automations and communications, with end-user apps such as Kanban and Wiki on top. The idea that makes the rest make sense: a small core supplies every shared capability, and extended modules add business features by registering with core at boot, never by changing it.

## One deployment, one organization

Monark is single-tenant. A deployment serves exactly one organization. The API creates that organization at first boot from the `INITIAL_ORG_*` environment variables (or `pnpm provision:org` creates it on demand), and every user who signs up or signs in joins it automatically. There is no in-app setup wizard and no organization switcher.

To serve several businesses, [run several independent instances](../operate/run-several-instances.md), each with its own database, domain and branding. The same API image runs every instance; only its environment differs. See [Serve one organization per deployment](../decisions/0015-serve-one-organization-per-deployment.md) for why multi-tenancy was removed.

## Core and extended

Every feature lives in its own workspace package, and [modules.manifest.ts](../../modules.manifest.ts) assigns each one a tier.

- Core modules ship with every deployment and may depend on each other. Removing one breaks the app.
- Extended modules are business features. They may depend on core, never on another extended module, so any one of them can be removed without touching the others.

Whether a feature is core or extended is an engineering fact. Readers find Kanban next to Data in these docs, not in a separate "modules" area. The full list is in [Modules](../reference/modules.md); how the tiers are enforced is in [Architecture](architecture/_index.md).

## The map

Core subsystems:

| Subsystem                | What it does                                                                               | Read more                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Architecture             | Module tiers, boundaries, the event bus, codegen, boot sequence, the web app shell         | [Architecture](architecture/_index.md)                               |
| Users and authentication | Accounts, sign-in, two-factor, trusted devices, organization membership                    | [Users and authentication](users-and-authentication.md)              |
| Permissions              | Roles, granular permissions, and per-record restrictions                                   | [Permissions](permissions.md)                                        |
| Data models and queries  | Admin-defined databases (models, fields, records) and the query language that filters them | [Data models and queries](data-models-and-queries.md)                |
| Automations              | Event-triggered flows built as node graphs and run by a durable worker                     | [Automations](automations.md)                                        |
| Notifications            | In-app and email messages, with per-user preferences                                       | [Notifications](notifications.md)                                    |
| Identity and integration | Webhooks, API keys, service accounts, and the public REST API                              | [Identity and integration](identity-and-integration.md)              |
| Secrets                  | A write-only, encrypted store for the credentials integrations use                         | [Secrets](secrets.md)                                                |
| Chat agent               | The in-app assistant, which acts through the same routes as the public API                 | [Chat agent](chat-agent.md)                                          |
| Block editor             | The block-based document editor shared by wiki pages, cards and document fields            | [Block editor](block-editor.md)                                      |
| Files                    | Signed uploads to private storage, used by file fields                                     | [Files](files.md)                                                    |
| Feature flags            | Runtime switches resolved per user, role, organization or globally                         | [Feature flags](../reference/feature-flags.md)                       |
| Global search            | One command palette that searches every module that registers a source                     | [The extensibility contract](architecture/extensibility-contract.md) |
| Branding                 | The app name, colours, logo and sender address, set per deployment                         | [Rebrand an instance](../operate/rebrand-an-instance.md)             |

Extended modules:

| Module                                 | What it does                                                        | Read more                                                  |
| -------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Kanban                                 | Boards, columns and cards                                           | [Use Monark](../use/_index.md)                             |
| Calendar                               | Calendars, events, reminders, and events generated from data models | [Use Monark](../use/_index.md)                             |
| Wiki                                   | A tree of nested pages                                              | [Use Monark](../use/_index.md)                             |
| Achievements                           | Badges awarded automatically when events happen                     | [Achievements](achievements.md)                            |
| GitHub, Telegram, Discord, X (Twitter) | Connect a third-party service to automations                        | [Integration modules](architecture/integration-modules.md) |

## The pieces that run

Two thin services compose the modules into a running app, and neither holds business logic:

- `services/web` is the Next.js frontend. It imports each module's client and contract code.
- `services/api` is the Express and tRPC backend. It imports each module's server and contract code, registers every module at boot, starts the background workers, and serves the public REST API under `/api/v1`.

PostgreSQL holds the data and Supabase provides sign-in sessions and file storage. The full list of technologies is in [Tech stack](../reference/tech-stack.md).

## Limits

- One organization per deployment. Serving another business means another instance.
- The event bus is in memory; an event is durable only once a webhook or automation outbox has recorded it. See [The event bus](architecture/event-bus.md).
- Feature-flag overrides have no admin screen; they are set through the API or, in development, with `pnpm enable:dev-flags`.

## Related

- [Architecture](architecture/_index.md)
- [Modules](../reference/modules.md)
- [Domain events](../reference/events.md)
- [Feature flags](../reference/feature-flags.md)
