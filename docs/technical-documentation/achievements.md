# Achievements module

Configurable, event-driven gamification. An admin defines badges and the _conditions_
that hand them out; the engine watches the platform's domain-event bus and awards a user
when their conditions are met ; integrated with every core + extended module, with no
per-module wiring. Package API + data model: [`packages/achievements/README.md`](../../packages/achievements/README.md).

## Why it "integrates with everything"

The app has a **live event-type registry** ; every module calls `registerEventTypes(...)`
at boot, declaring its event types _and their payload fields_. Achievements reuses that:

- A condition (`AchievementRule`) stores an `eventType` string. The rule editor lists every
  registered type (`listEventTypesByModule`) and, for the chosen one, its payload fields
  (`eventFieldsFor`) : so the admin picks a trigger and its **subject** / **match** fields
  from real metadata. Add a new module with new events, and they show up automatically.
- Events carry `actorId` (the acting user) by convention. `subjectField` defaults to it, but
  can be any payload field ; including an array (`assigneeIds`) to credit several users.

There is no coupling to any specific module; achievements only knows "event types" and
"payload fields", which is exactly what the registry exposes.

## The durable engine (outbox + worker)

Awarding is durable (a restart must never drop a count), so it mirrors the automation run
outbox rather than acting inline on the best-effort in-memory bus:

```
 emit(event) ──▶ wildcard subscriber ──▶ AchievementOutbox (PENDING)
                    (cheap: "any enabled rule           │
                     for this org+type?" → persist)     ▼
                                              achievementsTick (worker)
                                              claim (leased, status-guarded)
                                              ├─ recipientsFor(rule, event)  (pure matcher)
                                              ├─ filter to HUMAN users
                                              ├─ incrementProgress (upsert on ruleId+userId)
                                              └─ count ≥ threshold →
                                                   awardIfAbsent (unique achievementId+userId)
                                                   → emit achievements.awarded + notify
```

- **Subscriber** : does only cheap work (an existence check + an insert), so a slow
  evaluation never blocks the mutation that emitted the event. Wrapped so a hiccup can't
  roll back the emitter.
- **Claim** : `claimOutboxBatch` moves `nextAttemptAt` into the future (a lease) with a
  `updateMany` guarded on `status = PENDING`, so exactly one worker owns a row until it's
  marked DONE or the lease expires (crash recovery) ; no RUNNING status needed. Enqueue
  stamps `nextAttemptAt` from the app clock so the worker's `now` comparison uses one clock
  (avoids app-vs-DB skew).
- **Idempotency** : progress is an upsert-increment; the award has a unique
  `(achievementId, userId)`, so re-processing or crossing the threshold repeatedly awards
  once and emits `achievements.awarded` once. That also makes it loop-safe: because the
  award event sets `actorId = userId`, a **meta-achievement** watching `achievements.awarded`
  credits the earner ("earn 5 achievements") without an infinite loop.
- **Retry** : a failed row backs off and dead-letters to `FAILED` after `ACHIEVEMENTS_MAX_ATTEMPTS`.

The pure matcher (`ruleEventTypeMatches` / `payloadMatches` / `subjectsOf` / `recipientsFor`)
lives in `contracts/matching.ts` and is unit-tested in isolation; the worker and subscriber
just orchestrate DB + bus around it.

## Big-5 + boundaries

Extended module depending only on core packages. RBAC (`achievements.manage` / `view`),
event (`achievements.awarded`), notifications (in-app, en+fr), webhooks (free via the event
type), feature flag (`achievements.enabled`, default off). Own schema fragment; cascade flows
through `Achievement → Organization`; `userId`s are org-member soft refs (no core FK).

## Web

`/admin/achievements` ; CRUD achievements + their conditions (event-type / subject /
match-field pickers from the live registry). `/achievements` ; the user gallery (earned
badges, progress bars, locked catalog). Both flag-gated (server 404 + flag-gated nav
entries).
