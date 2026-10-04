---
type: decision
status: accepted
date: 2026-07-26
---

# 0004. Run automations from a durable outbox

## Context

Automations react to domain events, and the event bus is in memory and best-effort ([Keep the event bus in memory](0002-keep-the-event-bus-in-memory.md)). A flow can call external services, wait for hours on a Delay node, or fail and need a retry. Running it inside the bus subscriber would put that work on the request that emitted the event, lose it on a restart, and give no record of what happened. The API can run as more than one process, and two processes must never run the same flow for the same event.

## Options

| Option                                                     | For                                                             | Against                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Run the flow inline in the bus subscriber                  | Simplest; no queue                                              | Slows or breaks the emitting request; lost on restart; no retries; delays impossible |
| An external job queue (Redis, a hosted queue)              | Mature retries and scheduling                                   | New infrastructure for every deployment                                              |
| A run table in Postgres as the outbox, drained by a worker | Durable with the database already there; doubles as run history | Polling latency; Monark owns the claim, retry and resume logic                       |

## Decision

The wildcard subscriber only inserts a `PENDING` `AutomationRun` per matching enabled flow. A worker in the API process polls every 5 seconds, claims each due run with an update guarded on `status = PENDING` so exactly one process wins, and executes it, recording one `AutomationRunStep` per node. Failures retry with exponential backoff up to 3 attempts, then the run is marked failed. A Delay suspends the run back to `PENDING` with a later due time, without counting a retry, and the engine rebuilds its state from the recorded steps on resume.

The deciding reason: Postgres is already in every deployment, and the run table gives durability, multi-process safety and run history at once. It mirrors the webhook delivery outbox, which had already proven the shape.

## Consequences

- Emitting an event stays cheap, and a broken flow can't affect the action that triggered it.
- Runs survive restarts, including runs paused on a Delay for days.
- Run history and per-node logs come for free from the outbox rows.
- A run starts up to about 5 seconds after its trigger.
- Retries resume at the failed node, so nodes must tolerate being re-entered after a crash mid-node.
- Achievements later copied the pattern, with a lease instead of a running status.
