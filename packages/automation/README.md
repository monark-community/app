# @monark/automation

Event-triggered automation flows with a visual node-graph editor. An admin builds a flow on a canvas (a trigger node bound to a domain event, wired to action nodes), and when a matching event fires on the platform event bus the flow runs server-side: send a notification, call a webhook, and (later) create records, assign roles, manage users. Core tier — the trigger engine subscribes to the platform-wide event bus, and other modules (core or extended) contribute their own node types through a registry, so Automation must be depend-able by everyone without depending back.

**Status: shipped end-to-end (behind the `automation.enabled` flag, default off).** Module + Prisma models + contracts + data layer (Phase 1); node registry + execution engine + built-in nodes + wildcard subscriber + durable worker + full tRPC router (Phase 2); the flag-gated `/automation` web section — a `DataTable` list + a React Flow editor (palette, config panel, save, run-now, run history) (Phase 3). Technical internals: [docs/technical-documentation/automation.md](../../docs/technical-documentation/automation.md).

**Built-in nodes** ([nodes/](src/server/nodes)): Event Trigger ; Control flow — Condition (true/false branch), Constant, Transform (formula), Delay (durable) ; Communication — Send Notification, Send Email, Webhook ; Data — Create / Update / Delete / Find Record / Find Records (filter) ; RBAC — Assign / Remove Role ; User — Get User, Set Metadata, Update Profile, Deactivate/Reactivate. Privileged nodes (data writes, role changes, metadata/profile/account writes) re-check that the automation's owner holds the underlying permission at run time (`requireOwnerPermission`, [nodes/shared.ts](src/server/nodes/shared.ts)). The engine gates branches via output-handle activation (`ctx.activateOutputs`) and supports durable pauses (`ctx.suspend` + a resumable `executeGraph`).

Follow-ons: user account **create** (an invite-flow decision — `signUpUser` needs Supabase creds + a password strategy) ; a richer config form (per-field validation surfacing, expression autocomplete).

## What's here

- `/contracts`
  - `graph.ts` — the persisted flow shape: `AutomationGraph` (`{ nodes, edges }`), `NodeInstance`, `Edge`, their zod schemas, `EMPTY_GRAPH`, and `parseGraph()` (defensive read of the `Json` column). Shared verbatim by the editor (save/load) and the engine (execute).
  - `nodes.ts` — the **extension surface**: `AutomationNodeDescriptor` (the serializable half of a node type: kind / category / label / ports / `configFields`), plus the config-field descriptor types the web fields toolkit renders. The server registry pairs each descriptor with a zod `configSchema` + a server-only `execute()`.
  - `events.ts` — `AutomationEvents` (created / updated / deleted + run-started / run-succeeded / run-failed).
- `/server`
  - `data.ts` — Prisma data layer: paginated `listAutomations`, automation CRUD (create / update / soft-delete / restore / hard-delete), and the run read surface (`listAutomationRuns`, `findAutomationRunById`). `serializeAutomation` parses the `graph` `Json` column into a typed `AutomationGraph` for tRPC.
  - `permissions.ts` — `automation.{view,create,manage,run}` (`registerAutomationPermissions`).
  - `event-types.ts` — operator descriptions for the `automation.*` events (`registerAutomationEventTypes`).
  - `feature-flags.ts` — the `automation.enabled` kill-switch, default off (`registerAutomationFeatureFlags`).
  - `automationRouter` — Phase-1 stub ; the real router lands in Phase 2.

Prisma models live under `// ── MODULE: automation ──` in `packages/db/prisma/schema.prisma`: `Automation`, `AutomationRun`, `AutomationRunStep` (+ the `AutomationRunStatus` / `AutomationRunStepStatus` enums ; `AutomationRunStep.activeHandles` records the output handles a node activated, for durable-delay resume). Migrations: `20260725231737_add_automation`, `20260726195100_automation_step_active_handles`.

## Key concepts

**The graph is a single JSON blob, not normalized tables.** `Automation.graph` stores exactly what React Flow holds (`{ nodes: NodeInstance[], edges: Edge[] }`), validated against `automationGraphSchema` on save and re-parsed by the engine before a run. This keeps save/load atomic and the editor ↔ engine contract in one place ; per-node config is an opaque object validated per-type against that node's own `configSchema` at execution time.

**Node types are a registry, like permissions and event types.** Any module calls `registerAutomationNodes("<module>", { ... })` at api boot to contribute node types — Core ships the built-ins through the same API. The server registry holds the full definition (descriptor + `configSchema` + `execute`) ; a tRPC query projects only the serializable `AutomationNodeDescriptor` to the editor palette, so a node's server-side `execute` never crosses to the client. _(Registry + engine land in Phase 2.)_

**Execution is durable, off the request path.** The event bus awaits its subscribers inline, so the wildcard subscriber does only cheap work — match enabled automations for the event's org and insert one `AutomationRun` (the outbox row, `status = PENDING`) each — then returns. A background worker claims `PENDING` runs, executes the graph node-by-node recording an `AutomationRunStep` per node, and retries with backoff via `attempts` / `nextAttemptAt`. This mirrors `@monark/webhooks`' outbox + delivery worker. _(Subscriber + worker land in Phase 2.)_

**Runs act as their owner.** A run executes under the automation's `createdBy` identity ; privileged nodes (RBAC, user management) re-check that the owner holds the underlying capability at execution time, so an automation can't escalate beyond what its author could do by hand.

**Triggers.** A flow has exactly one trigger node, which fixes how it fires. **Event Trigger** matches a domain event by type (the wildcard subscriber). **Manual** runs only from "Run now". **HTTP** fires from an inbound `POST /hooks/automation/:id` with a per-automation secret. **Schedule** is cron-like : its `AutomationSchedule` config (see `contracts/schedule.ts` — `interval` / `daily` / `weekly` / `monthly-day` / `monthly-nth-weekday`, all UTC) drives `Automation.scheduleNextRunAt`, an indexed column the **scheduler** (`runDueSchedules`, driven by the worker loop + a `/cron/run-automation-schedules` fallback) claims when due — enqueuing a run and advancing to the next fire via an atomic compare-and-set, so a fire enqueues exactly one run. Manual / HTTP / Schedule store a bus-ignored `automation.*` sentinel `triggerEventType`, so they never fire from a platform event. The editor's schedule builder works in the viewer's local timezone and converts to/from UTC at the storage boundary.

**Nodes can narrate a run.** An `execute` gets `ctx.log(message, level?)` — structured lines (`info` / `warn` / `error`) the engine buffers per step (capped) and persists on the step's `logs` column however it ends (success / caught error / hard fail). The editor surfaces them in a per-node **Logs** section, and the step's resolved `input` doubles as the source of truth for showing what value each wired input actually received. Logs are diagnostic only — they never affect control flow (throw to fail a node).

## Public API

| Export                                                                                                                                                     | From         | Purpose                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `registerAutomationPermissions()`                                                                                                                          | `/server`    | Register `automation.{view,create,manage,run}` at boot.                                          |
| `registerAutomationEventTypes()`                                                                                                                           | `/server`    | Register `automation.*` operator descriptions at boot.                                           |
| `registerAutomationFeatureFlags()`                                                                                                                         | `/server`    | Register the `automation.enabled` flag at boot.                                                  |
| `listAutomations` / `findAutomationById` / `createAutomation` / `updateAutomation` / `softDeleteAutomation` / `restoreAutomation` / `hardDeleteAutomation` | `/server`    | Automation data layer (paginated list + CRUD).                                                   |
| `listAutomationRuns` / `findAutomationRunById`                                                                                                             | `/server`    | Run history read surface.                                                                        |
| `serializeAutomation`                                                                                                                                      | `/server`    | Parse a row's `graph` `Json` into a typed `AutomationGraph`.                                     |
| `AutomationGraph` / `NodeInstance` / `Edge` / `parseGraph` / `EMPTY_GRAPH`                                                                                 | `/contracts` | The shared flow-graph contract.                                                                  |
| `AutomationNodeDescriptor` and config-field types                                                                                                          | `/contracts` | The node-type extension contract.                                                                |
| `AutomationRunStepLog` / `AutomationRunStepLogLevel`                                                                                                       | `/contracts` | A node's per-step log line (`ctx.log`), rendered in the editor.                                  |
| `AutomationSchedule` / `automationScheduleSchema` / `nextFireTime` / `scheduleFromGraph`                                                                   | `/contracts` | The cron-like schedule union (UTC), its zod schema, next-fire computation, and graph extraction. |
| `runDueSchedules`                                                                                                                                          | `/server`    | Enqueue runs for due scheduled triggers + advance them (worker loop + `/cron` fallback).         |
| `AutomationEvents`                                                                                                                                         | `/contracts` | The module's domain-event union.                                                                 |

## Events emitted / consumed

- **Emits:** `automation.created`, `automation.updated`, `automation.deleted`, `automation.run-started`, `automation.run-succeeded`, `automation.run-failed`.
- **Consumes:** _every_ registered domain event, via a wildcard subscriber that matches events against automations' `triggerEventType` (Phase 2). It skips `automation.*` events as triggers to avoid feedback loops.

## tRPC surface

`trpc.automation.*` — Phase-1 stub. The Phase-2 router adds `automations` (list / getById / create / update / setEnabled / delete / restore / run-now), `runs` (list / getById), `nodeTypes.list` (palette descriptors), and `eventTypes.list` (trigger picker).
