---
type: concept
---

# How the API boots

`services/api/src/server.ts` wires every module into one process. When the file loads, it fills every registry in a fixed order; then, only when it runs as the entry point, it provisions the organization, starts the background workers and listens. Tests import the same file to get the configured app without workers or listeners.

## Registration order

Registries are flat namespaces, so order within a step doesn't matter. Order between steps does, wherever a later step reads an earlier registry.

1. Feature flags: every module's flags, before any code can resolve one.
2. Permissions: before any permission check.
3. Event types: the operator-facing event metadata.
4. Organization-scoped visibility resolvers: so the roles screen and the webhook picker show each organization only its own data models' permissions and events.
5. Notification kinds and templates: before any subscriber can call `notify()`.
6. Automation nodes: built-in nodes, then those from extended modules.
7. Search sources: the order here is the group order in the command palette.
8. Chat tool executor: built from the public API's route list, before any chat message is processed.
9. Model integrations: modules that map data-model fields to their own concepts (Calendar) declare their slots before an admin can save a mapping.
10. Event subscribers: the organizations subscriber first, so automatic membership lands before anything routes on it; the automation and achievements subscribers after the notification ones; the webhook subscriber last, so its outbox writer sees every other handler's effects.
11. Development event tap: outside production only.

An extended module adds its `register*` calls to the matching steps. This list is maintained by hand.

## Routes

The Express app mounts, in order:

| Route                                             | Purpose                                                             | Authentication                      |
| ------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `GET /health`                                     | Liveness                                                            | none                                |
| `/api/v1/*`                                       | The public REST API, mounted before `/trpc` with its own middleware | API key, plus rate limiting         |
| `POST /cron/*`                                    | External fallbacks for the background work below                    | `Bearer` `CRON_SECRET`              |
| `POST /hooks/automation/:id`                      | Fires an automation's HTTP trigger                                  | `Bearer` per-automation secret      |
| `POST /hooks/github/:org`, `/hooks/telegram/:org` | Inbound deliveries from integration providers                       | provider signature or secret header |
| `POST /chat/stream`                               | Streams the assistant's reply as server-sent events                 | Supabase session                    |
| `/trpc/*`                                         | Every module's tRPC router                                          | Supabase session                    |

The raw request body is kept for the inbound hook routes, so signatures are checked against exactly the bytes the provider sent.

## Background work

When the file is the process entry point, it also:

- provisions the single organization from `INITIAL_ORG_SLUG` and `INITIAL_ORG_NAME` if it doesn't exist yet (a no-op on later boots);
- wires the webhook secret resolver, then starts the webhook delivery worker;
- starts the automation run worker and the achievements worker;
- ensures the storage buckets for data-model files and achievement icons exist;
- runs the calendar reminder sweep every 60 seconds;
- syncs every registered flag into the `FeatureFlag` table, so overrides attach to real rows;
- re-registers each data model's permissions and event types from the database, because in-memory registries are empty after a restart.

Each in-process loop has a matching `/cron/*` endpoint (sweep webhook deliveries, run automation schedules, send calendar reminders), so an external scheduler can keep work moving if every API replica is stuck. Account deletions after the grace period run only from `/cron/process-account-deletions`. The cron endpoints are idempotent.

## Related

- [The extensibility contract](extensibility-contract.md)
- [The event bus](event-bus.md)
- [Platform overview](../platform-overview.md)
- [Operate](../../operate/_index.md)
