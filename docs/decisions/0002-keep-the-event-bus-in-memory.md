---
type: decision
status: accepted
date: 2026-05-07
---

# 0002. Keep the event bus in memory and put durability in outboxes

## Context

Modules react to each other through domain events. Some reactions are cheap and local, such as sending a security email when a password changes. Others must not be lost, such as delivering an event to a customer's webhook endpoint or running an automation. A durable bus, persisting every event before any handler runs, would make every emit a database write and add a dispatcher to operate, for the benefit of the minority of consumers that need it.

## Options

| Option                                                                  | For                                                    | Against                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| A persisted bus with a dispatcher and retries for every handler         | Nothing lost, for any subscriber                       | A write and a queue for every emit; every subscriber must be idempotent; more to run                  |
| An external broker                                                      | Proven delivery guarantees                             | A new piece of infrastructure for every deployment, which conflicts with running many small instances |
| An in-memory bus; consumers that need durability write their own outbox | Emits stay cheap; durability is paid only where needed | Events can be lost between the emit and the outbox write; each durable consumer builds its own outbox |

## Decision

The bus in `@monark/common` stays in process and best-effort: handlers run in order, each isolated so a failure is logged and skipped. Consumers that need durability subscribe with a wildcard and write an outbox row that a worker drains with retries. Webhooks did this first, with at-least-once delivery; automations and achievements followed the same shape. The webhook subscriber registers last so it records the event after every other handler has run.

The deciding reason: only a few consumers need guaranteed delivery, and an outbox per consumer gives them that without making every emit pay for it.

## Consequences

- An event emitted moments before the process dies, before its subscribers run, is lost. Anything that must reach an external system goes through webhooks, not a bus subscriber.
- Subscribers run inside the emitting request, so a slow subscriber slows the request; heavy work belongs in an outbox worker.
- The webhook, automation and achievement outboxes are three similar implementations, each with its own worker.
