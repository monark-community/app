---
type: concept
---

# How achievements are awarded

Achievements are badges an admin defines and Monark hands out automatically. Each badge has one or more conditions, and a condition reads "this event happened N times for this person". Because every module already describes its events in a shared registry, achievements work with any module, including ones added later, without any wiring in that module.

## Conditions come from the event registry

At boot, every module registers its event types together with the fields each event carries. The achievement editor reads that registry, so the admin picks real values from lists:

| Part of a condition | What it means                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Event               | the event type to count, such as a card being created                                    |
| Threshold           | how many matching events a person needs (default 1)                                      |
| Subject field       | which field of the event names the person to credit; defaults to the actor               |
| Match               | optional field values the event must have, for example a specific column; all must match |

The subject field can hold a list of users, such as a card's assignees, so one event credits several people. A badge with several conditions is awarded as soon as any one of them reaches its threshold. Achievements knows nothing about kanban, wiki or data models; it only knows event types and their fields.

Only human users earn badges. Service accounts are filtered out.

## Durable counting

Awarding must survive a restart without losing or double-counting, so it runs through an outbox and a worker, the same pattern as [automations](automations.md):

```
 emit(event) ─▶ subscriber: any enabled condition for this org and event type?
                   │ yes: insert an outbox row (PENDING)
                   ▼
              worker (every 5 s): lease a batch
                   ├─ work out who to credit (pure matcher)
                   ├─ keep human users only
                   ├─ add 1 to each person's progress on that condition
                   └─ threshold reached → award once, emit achievements.awarded, notify
```

- The subscriber does almost nothing: one existence check and one insert. A slow evaluation never blocks the action that emitted the event, and an error there can't roll that action back.
- Claiming is a lease. The worker pushes a row's next-attempt time forward with an update guarded on its status, so exactly one worker owns it until it's done or the lease runs out (60 seconds), which also recovers rows from a crashed worker.
- Awarding is idempotent. Progress is an upsert-and-increment, and an award is unique per badge and user. Processing an event twice, or passing the threshold again, still awards once and emits `achievements.awarded` once.
- Meta-achievements are safe. The award event names the earner as its actor, so a badge for "earn 5 achievements" can count `achievements.awarded` without looping.
- Failures retry with backoff and are marked failed after five attempts.

The matching logic is pure and lives in the package's contracts, so it's tested without a database; the worker and subscriber only move data around it.

## Where it shows up

Admins manage badges and their conditions on the **Achievements** admin page, including an optional badge image stored in a public files bucket. Members see their earned badges, progress bars and the locked ones on their **Achievements** page. An award sends an in-app notification, and because `achievements.awarded` is a registered event, webhooks can subscribe to it.

## Limits

- The whole module is behind the `achievements.enabled` feature flag, off by default.
- Matching is string equality on event fields; there are no ranges or patterns.
- Counting starts when a condition exists. Events from before it was created don't count.
- A condition counts events per person; there are no team or organization-wide badges.

## Related

- [Automations](automations.md): the same outbox-and-worker pattern
- [Administer](../administer/_index.md): setting up achievements for your organization
- [achievements package README](../../packages/achievements/README.md)
