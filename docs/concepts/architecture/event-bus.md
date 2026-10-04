---
type: concept
---

# The event bus

Modules react to each other through domain events: a module emits `kanban.card-moved`, and any module that cares subscribes, without either importing the other. The bus is in-process and in memory. It decouples modules; it does not make events durable. Durability comes from the outboxes that two of its subscribers write.

## How an emit runs

The runtime is `emit` and `on` in `@monark/common`, used only on the API side.

1. Server code calls `await emit({ type, occurredAt, ... })` after it changes state.
2. The bus runs every handler subscribed to that exact type, in registration order, awaiting each.
3. It then runs every wildcard handler (`on("*", ...)`), also in order.
4. Each handler is wrapped in its own `try/catch`. A failing handler is logged and the loop moves on; the error never reaches the code that emitted.

Because handlers are awaited, a subscriber's work happens inside the emitting request. Nothing is queued, persisted or retried at the bus level.

Every event extends a common base: `type`, `occurredAt`, an optional `correlationId`, and optional `subscriptionAliases`, extra type strings the event also matches for webhook routing. Data Models uses aliases so a record event also matches `data-models.<model>-record-created` without adding a new member to the union for every model.

## Two views of the same events

| View                    | What it is                                                                                                               | Who reads it                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| The `DomainEvent` union | A TypeScript union generated from each module's `contracts/events.ts` by `pnpm gen:events`. Compile time only.           | `emit` and `on`, so a wrong type or payload fails typecheck.           |
| The event-type registry | A runtime list built from each module's `registerEventTypes` call: type, owning module, description, and payload fields. | The webhook subscription picker and the automation Event Trigger node. |

The two are kept aligned by convention, not by a check. The webhook module's own events (`webhook.*`) are in the union but deliberately not in the registry: the webhook subscriber skips them to avoid delivering webhooks about webhooks. The full catalog is in [Domain events](../../reference/events.md).

## Where durability comes from

Three wildcard subscribers turn events into durable work by writing them to an outbox table that a worker drains:

- Automations match each event against enabled flows and enqueue a run in the automation outbox. A worker drains it with retries. It ignores `automation.*` events, so a flow can't trigger itself in a loop.
- Achievements enqueue an event in their own outbox when an enabled award rule listens for it. A worker does the counting and awarding.
- Webhooks write an outbox row for every endpoint subscribed to the event. A worker delivers each row at least once, with retries and backoff, and survives a process restart.

The webhook subscriber registers last, so its outbox writer sees the event after every other handler has run. If you need an event to reach an external system reliably, rely on webhooks, not on a bus subscriber. The gap that remains: an event emitted moments before the process dies, before the subscribers have run, is lost.

See [Keep the event bus in memory and put durability in outboxes](../../decisions/0002-keep-the-event-bus-in-memory.md) for why.

## Seeing events in development

Outside production, the API installs a tap that records every emit in a ring buffer. The developer overlay (Alt+D in the web app) shows the most recent events.

## Related

- [Domain events](../../reference/events.md)
- [How the API boots](api-boot-sequence.md)
- [Identity and integration](../identity-and-integration.md)
- [Automations](../automations.md)
