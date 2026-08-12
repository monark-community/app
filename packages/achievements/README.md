# @monark/achievements

Configurable, event-driven **achievements** (gamification). An admin defines badges and the _conditions_ that hand them out ; the engine watches the platform's domain-event bus and awards a user when their conditions are met. Extended module.

## What's here

- `/contracts` — `AchievementsEvents` (`achievements.awarded`), the pure **matcher** (`ruleEventTypeMatches` / `payloadMatches` / `subjectsOf` / `recipientsFor` — "does this event count, and for whom?"), and the notifications registry augmentation.
- `/server` — Prisma data layer (`data.ts`), the wildcard event **subscriber** (`subscriber.ts`), the durable **worker** (`worker.ts`), the Big-5 registrations (`permissions.ts` / `event-types.ts` / `flags.ts` / `notification-kinds.ts`), and the `achievementsRouter` tRPC sub-router (`router.ts`).

Prisma models live under `// ── MODULE: achievements ──` in the assembled `schema.prisma`: `Achievement`, `AchievementRule`, `AchievementProgress`, `AchievementAward`, `AchievementOutbox` (+ `AchievementOutboxStatus`). Migrations: `20260809010000_add_achievements`, `20260809020000_achievement_icon_file`, `20260809030000_achievement_drop_emoji`. A badge is an **uploaded image** (`Achievement.iconFileId` → a `@monark/files` `StoredFile` in the public `achievement-icons` bucket) ; the router resolves `iconFileId` to a public `iconUrl` on every read. When no image is set the UIs render a neutral `Award` placeholder ; in the user gallery a locked (unearned) badge is rendered grey-scaled.

## Key concepts

**A rule watches a registered event type.** An `AchievementRule` names an `eventType` (any type in the live event-type registry — every core + extended module registers into it), a `threshold` (how many matching events per user before the award), a `subjectField` (which payload field names the recipient, default `actorId`), and an optional `match` (payload equality filters, e.g. `{ "toColumnId": "done" }`). Because the config reads the **live registry** (`listEventTypesByModule` + `eventFieldsFor`), _any_ module's events — kanban `card-created`, data-models `record-created`, calendar, chat, … — are selectable, and the subject / match fields are picked from each event's declared payload fields. That's what "integrated in core and extended modules" means: no per-module wiring.

**Crediting is per-user, from the event's actor.** Domain events carry `actorId` (the acting user) by convention ; `subjectField` defaults to it but can be any field — including an **array** field (`assigneeIds`) to credit several users at once. SERVICE principals never earn achievements (`filterHumanUserIds`).

**Awarding is durable (outbox + worker), like automation.** The wildcard subscriber does only cheap work — if the event's org has any enabled rule watching this type, it persists the event to `AchievementOutbox` — so a slow evaluation never blocks the mutation that emitted the event, and a **restart never drops a count**. A background worker (`startAchievementsWorker` / `achievementsTick`) claims due rows via a leased, status-guarded `updateMany` (safe across processes), increments `AchievementProgress` (upsert on the unique `(ruleId, userId)`), and on crossing the threshold creates an `AchievementAward` (unique `(achievementId, userId)` → **awarded once**), emits `achievements.awarded`, and notifies the user. Failed rows retry with backoff and dead-letter to `FAILED`.

**Chainable.** `achievements.awarded` sets `actorId = userId`, so a **meta-achievement** watching it (default subject) credits the earner — "earn 5 achievements". The unique award constraint makes this loop-safe (each award fires the event once).

## Permissions + flag

`registerAchievementsPermissions()` registers `achievements.manage` (create/configure achievements + conditions) and `achievements.view` (the catalog + one's own awards). `registerAchievementsFeatureFlags()` registers `achievements.enabled` (default off) — the kill switch for the config UI, the award engine, and the user gallery.

## tRPC procedures (`trpc.achievements.*`)

| Procedure                                        | Permission | Notes                                                                                      |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| `list`                                           | `manage`   | The org's achievements + their rules (admin config).                                       |
| `create` / `update` / `delete`                   | `manage`   | CRUD an achievement (soft-delete).                                                         |
| `rules.create` / `rules.update` / `rules.delete` | `manage`   | CRUD a rule (the award condition).                                                         |
| `eventTypes`                                     | `manage`   | The live event-type catalog + payload fields, for the rule editor's pickers.               |
| `catalog`                                        | `view`     | The org's enabled achievements (locked + earned).                                          |
| `myAwards`                                       | `view`     | The caller's earned achievements.                                                          |
| `myProgress`                                     | `view`     | The caller's in-progress rules (count / threshold) for progress bars.                      |
| `summary`                                        | `view`     | Compact awards summary (earned count + latest N badges) for the account-menu shell widget. |

## Events emitted

- `achievements.awarded` — a user earned an achievement (payload : `organizationId`, `achievementId`, `achievementName`, `points`, `userId`, `actorId`). Subscribable by webhooks + a valid achievement trigger itself.

## Notifications

- `achievements.awarded` — in-app by default (email opt-in), en + fr, "Achievement unlocked: {{ achievementName }}".

## Boundaries / Big-5

Extended module ; depends only on **core** packages (`common`, `db`, `feature-flags`, `files`, `notifications`, `organizations`, `rbac`). RBAC ✅ · event bus ✅ (`achievements.awarded`) · notifications ✅ · webhooks ✅ (free) · feature flag ✅. Owns its own schema fragment ; `userId` fields are org-member soft refs (no core FK), cascade flows through `Achievement → Organization`.
