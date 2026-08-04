# @monark/calendar

> **User guide:** [docs/user-guide.md](docs/user-guide.md) — how to use the calendar (this README is the developer reference).

Extended calendar module. Org-scoped, role-access-controlled calendars with **Day, Week, Month, and Agenda** views ; event CRUD with reminders and conflict detection ; ICS import/export ; and materialization of Data Records into calendar events. The package ships the framework-pure Day-View primitives (vertical timeline, per-column schedules, a real-time current-time indicator, click-to-create/edit) plus the week/month date helpers ; the wired multi-view shell and sidebar live in `services/web`. Full persistence via Prisma + tRPC.

## What's here

- `/contracts` — `CalendarEvent`, `CalendarEventTime`, `ColumnDef`, `DaySchedule`, `CalendarDef` types, and `CalendarViewSettings` (`settings.ts` — the per-user view preferences schema).
- `/server` — Prisma data layer (`data.ts`), the five `calendar.*` permissions (`permissions.ts`), the full `calendarRouter` (calendar CRUD + event CRUD with reminders + agenda/search/conflict queries + ICS import/export + view-settings CRUD), the reminder notification kind (`notification-kinds.ts`), the emitted event types (`event-types.ts`), the Data Models integration slot declaration (`model-integration.ts`), and its materialization subscriber (`data-model-subscriber.ts`) — see "Key concepts".
- `/client` — pure React UI primitives (no shadcn imports): `DayTimeline`, `DayDateHeader`, `DayColumnHeader`, `DayColumnsArea`, `DayColumn`, `DaySchedule`, `DayEventBlock`, `CurrentTimeIndicator`, `useCurrentTime`, layout constants `HOUR_HEIGHT_PX` / `TOTAL_HEIGHT_PX`, and the week/month date helpers in `date-utils.ts` (`getWeekStart`, `buildWeekDays`, `buildMonthGrid`, `getWeekdayLabels`, `isWeekendDay`, `formatClockTime`, `formatHourLabel`).

The wired multi-view shell (`CalendarShell`, switching between `DayView`, `WeekView`, `MonthView`, and `AgendaView`), the new-event popover, sidebar, manage dialog, and the shadcn mini calendar live in [services/web/src/app/(authed)/calendar/](<../../services/web/src/app/(authed)/calendar/>) because shadcn is scoped to that service.

## Key concepts

**CalendarDef** — a named, colored calendar owned by an organization. Access is controlled by the `CalendarRoleAccess` join table — a role must appear in that table to see the calendar, or the user must have `calendar.manage`.

```ts
import type { CalendarDef } from "@monark/calendar/contracts";

const cal: CalendarDef = {
  id: "clx…",
  name: "Marketing Events",
  color: "#f43f5e",
};
```

**CalendarEvent** — a single event. Uses full `Date` objects for `startAt`/`endAt` so timezone handling and DB round-trips are unambiguous.

```ts
import type { CalendarEvent } from "@monark/calendar/contracts";

const event: CalendarEvent = {
  id: "clx…",
  calendarId: "clx…",
  startAt: new Date("2026-06-14T09:30:00"),
  endAt: new Date("2026-06-14T10:00:00"),
  title: "Sprint planning",
  location: "Room A",
  participants: ["alice@example.com"],
};
```

**CalendarEventTime** — a lightweight `{ hour, minute }` type used only for the click-to-snap flow (before a full date is known). Converting to `Date`: `new Date(selectedDate); d.setHours(t.hour, t.minute, 0, 0)`.

**Layout geometry** — all components share two constants:

```ts
import { HOUR_HEIGHT_PX, TOTAL_HEIGHT_PX } from "@monark/calendar/client";
// HOUR_HEIGHT_PX = 64   →  1 hour = 64 px, 15 min = 16 px (minimum clickable slot)
// TOTAL_HEIGHT_PX = 1536  →  full 24h grid height
```

Events are positioned absolutely: `top = (startAt.getHours() * 60 + startAt.getMinutes()) / 60 * HOUR_HEIGHT_PX`.

**Responsive & touch** — `DayColumn` / `DayColumnsArea` columns are `min-w-[85vw] md:min-w-[300px]`, so on phones a single calendar column fills the viewport and multiple calendars scroll horizontally. Drag-to-move and drag-to-resize on `DayEventBlock` use **Pointer Events** (not mouse-only), so they work under touch as well as mouse ; draggable surfaces carry `touch-none` to stop the browser hijacking the gesture as a scroll, and the resize handle is revealed while an event is selected or on coarse-pointer (touch) devices. The mobile shell decisions — collapsing Week/Month to Day and swapping the sidebar for a horizontal calendar strip — live in `services/web` behind the `useIsMobile` hook, not in this package.

**CalendarViewSettings** — per-user view preferences (hide weekends, first day of week, default view, 12h/24h time format, working-hours highlight), edited from a "view options" popover in the calendar toolbar (`services/web`). Stored via the users metadata sidecar (`@monark/users/server`'s `getUserMetadataValue`/`setUserMetadataValue`, module `"calendar"`, key `"view-settings"`) as a single JSON blob rather than a dedicated table — a few per-user scalars don't need indexing or FKs. `calendarRouter.settings.get/set/reset` read and write it directly (not through the generic `trpc.users.metadata.*` procedures, which `requirePermission` unconditionally even for a caller's own data) ; gated on `ctx.userId` only, since this is self-owned data. `date-utils.ts`'s `getWeekStart`/`buildWeekDays`/`buildMonthGrid` all take an optional `weekStartsOn` (`0 | 1`) and `hideWeekends` option so the web app's Day/Week/Month views, the sidebar mini-calendar, and the hour-gutter/event-label time formatting all read from one settings object instead of each hardcoding Sunday-first, 24h.

**Reminders** — an event can carry reminder offsets (`reminders: number[]`, minutes-before, up to 10) on `events.create` / `events.update`, persisted as `CalendarEventReminder` rows (`minutesBefore` + a precomputed `scheduledFor`). A boot-time sweep (`sweepCalendarReminders()` in `services/api`, every 60s, with `POST /cron/send-calendar-reminders` as an external fallback) finds due, un-notified reminders, resolves each calendar's members, dispatches the `calendar.event.reminder` in-app notification (category `ACTIVITY`, **IN_APP only**, en + fr), then stamps `notifiedAt`.

**RBAC** — five permissions registered at boot via `registerCalendarPermissions()` :

| key               | description                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `calendar.view`   | See calendars (and their events) whose role access includes the user's role                          |
| `calendar.create` | Create new calendars                                                                                 |
| `calendar.edit`   | Edit calendar name, description, and color                                                           |
| `calendar.delete` | Delete calendars (the personal calendar is protected)                                                |
| `calendar.manage` | Full management including role-access control ; bypasses the `roleAccess` filter (all org calendars) |

Enforcement in the shipped router: event CRUD and basic calendar-field edits gate on **accessibility** of the target calendar (a `calendar.view` user with access to it) ; calendar creation checks `calendar.create`, deletion/restore checks `calendar.delete`, and changing a calendar's role access requires `calendar.manage` — each also satisfied by `calendar.manage` (and by built-in admins). `registerCalendarPermissions()` additionally registers two metadata-sidecar hygiene permissions (`users.read-metadata-for-module-calendar` / `users.write-metadata-for-module-calendar`) for the per-user view settings ; the `settings.*` procedures never check them (self-owned data, gated on `ctx.userId`). Calendar has **no feature flag** — it is always on.

**Data Models integration** — Calendar is a consumer of `@monark/data-models`'s polymorphic engine (see that package's README, "Mapping, not reserved field keys"). `registerCalendarModelIntegration()` declares two slots under module key `"calendar"` :

| slot          | types                          | description                                   |
| ------------- | ------------------------------ | --------------------------------------------- |
| `time`        | `DATE`, `DATETIME`             | Which field is the event's time               |
| `calendarRef` | `RELATION` (target `Calendar`) | Which Calendar this record's event belongs to |

An admin maps a Data Model's own fields onto these slots via `trpc.dataModels.integrations.save`. `registerCalendarDataModelSubscriber()` listens for `data-models.record-{created,updated,deleted}` and upserts / soft- or hard-deletes a real `CalendarEvent`, keyed on the additive `sourceModule` + `sourceRecordId` columns (`@@unique`, both null for an ordinary hand-created event). Materialized events are always `eventType: "PUNCTUAL"` with `startAt === endAt` — the integration only maps one "time" slot, not a start/end pair. A record that stops satisfying an enabled mapping (mapped field cleared, or the integration disabled) gets its materialized event soft-deleted, not left stale ; re-satisfying the mapping on a later edit un-deletes it rather than creating a duplicate. This keeps every one of Calendar's own read paths (day view, reminder sweep) completely unaware that some `CalendarEvent` rows originated from a Data Record.

## tRPC procedures

All procedures are under `trpc.calendar.*`.

"Accessible" below means `calendar.view` plus access to the specific target calendar (its role access includes the caller's role, or the caller has `calendar.manage`).

| procedure                  | permission                          | description                                                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| `calendars.list`           | `calendar.view`                     | Calendars visible to the caller (`includeDeleted` for managers)         |
| `calendars.ensurePersonal` | authenticated                       | Returns (creating if needed) the org's protected personal calendar      |
| `calendars.create`         | `calendar.create` (or `manage`)     | Creates a calendar, optionally sets role access                         |
| `calendars.update`         | accessible (role access ⇒ `manage`) | Updates name/description/color ; changing role access requires `manage` |
| `calendars.delete`         | `calendar.delete` (or `manage`)     | Soft-deletes a calendar (personal calendar protected)                   |
| `calendars.restore`        | `calendar.delete` (or `manage`)     | Restores a soft-deleted calendar                                        |
| `calendars.members`        | accessible                          | Org members who can see the calendar                                    |
| `events.listForDay`        | `calendar.view`                     | Events across visible calendars within a start/end range                |
| `events.listAgenda`        | `calendar.view`                     | Cursor-paginated, forward-chronological events from a date (agenda)     |
| `events.create`            | accessible                          | Creates an event (with optional reminders) in an accessible calendar    |
| `events.update`            | accessible                          | Updates an event (caller must be able to see its calendar)              |
| `events.delete`            | accessible                          | Soft-deletes an event                                                   |
| `events.search`            | `calendar.view`                     | Title search across accessible calendars (command palette)              |
| `events.checkConflicts`    | `calendar.view`                     | Same-calendar overlapping events for the non-blocking conflict banner   |
| `events.exportIcs`         | `calendar.view`                     | Generates an ICS text blob (one calendar or all accessible)             |
| `events.importIcs`         | accessible                          | Parses an uploaded ICS text blob and creates events (capped 500)        |
| `settings.get`             | authenticated                       | The caller's `CalendarViewSettings` (defaults if none saved)            |
| `settings.set`             | authenticated                       | Merges a partial patch into the caller's view settings                  |
| `settings.reset`           | authenticated                       | Deletes the caller's saved settings (reverts to defaults)               |

## Usage

The recommended entry point is the wired `DayView` in `services/web`:

```tsx
// services/web/src/app/(authed)/calendar/page.tsx  (already shipped)
import { DayView } from "./day-view";
import type { CalendarDef } from "@monark/calendar/contracts";

export default async function CalendarPage() {
  const calendars = await fetchCalendars(); // via createServerTrpcClient
  return <DayView initialDate={new Date()} initialCalendars={calendars} canManage={false} />;
}
```

To use the primitives directly (custom layout):

```tsx
"use client";
import { DayTimeline, DayColumnsArea, COLUMN_HEADER_HEIGHT } from "@monark/calendar/client";

export function MyCalendar({ date, columns, eventsMap, onSlotClick }) {
  return (
    <div className="flex h-full overflow-hidden">
      <DayTimeline date={date} headerHeight={COLUMN_HEADER_HEIGHT} />
      <div className="flex-1 overflow-y-auto">
        <DayColumnsArea columns={columns} eventsMap={eventsMap} onSlotClick={onSlotClick} />
      </div>
    </div>
  );
}
```

## Dependencies

- `react` (peer) — bundled by `services/web`; not declared as a direct dep.
- `@monark/common` — shared event-bus types, `on`/`emit`.
- `@monark/data-models` — `registerModelIntegration` (contracts) and the record data layer (`findModelIntegration`, `listDataFields`, `findDataRecordById`) the materialization subscriber reads from.
- `@monark/db` — Prisma client (`getDb()`, `Prisma` namespace).
- `@monark/notifications/server` — `registerNotificationKind` (reminder kind).
- `@monark/organizations/server` — `requireOrg()`.
- `@monark/rbac/server` — `requirePermission()`, `getUserRoles()`, `hasPermission()`.
- `ics` — ICS (`.ics`) file generation for `events.exportIcs` ([server/ics.ts](src/server/ics.ts)).
- `node-ical` — ICS (`.ics`) file parsing for `events.importIcs` ([server/ics.ts](src/server/ics.ts)).

No Radix, no shadcn imports inside the package. The mini calendar (`react-day-picker`) lives in `services/web`.

## Operational

No env vars beyond what `@monark/db` already needs (`DATABASE_URL`, `DIRECT_URL`).

Run after schema changes:

```sh
pnpm db:migrate
pnpm db:generate
```

Permissions are registered at API boot via `registerCalendarPermissions()`. The Data Models integration needs two more boot-time calls, in this order relative to each other (both in `services/api/src/server.ts`) : `registerCalendarModelIntegration()` (before any admin request could save a mapping against an undeclared module) and `registerCalendarDataModelSubscriber()` (alongside the other domain-event subscribers).

`pnpm --filter @monark/calendar test:integration` runs `tests/integration/data-model-subscriber.test.ts` against a real Postgres testcontainer — the first integration suite for this module (it previously had none ; see the module-completeness gate's acknowledged gaps).

## Events emitted / consumed

**Emitted** (`contracts/events.ts`, registered for the webhooks picker + automation Event Trigger outputs via `registerCalendarEventTypes()`): `calendar.created`, `calendar.updated`, `calendar.deleted`, `calendar.event-created`, `calendar.event-updated`, `calendar.event-deleted`. Each carries the relevant ids + `organizationId` + `actorId` ; the two `*-updated` events include a `changed` array listing which fields the request set. Emitted best-effort (`.catch(() => {})`) after the mutation commits, so a subscriber failure never fails the write.

**Consumed**: `data-models.record-created` / `data-models.record-updated` / `data-models.record-deleted` from `@monark/data-models`, via `registerCalendarDataModelSubscriber()` — see "Key concepts" above.

## Deferred

Day/Week/Month/Agenda views, all-day/punctual event types, reminders, ICS import + export, conflict detection, and the module's own domain events have all shipped. What remains:

- **Recurring events (RRULE)** — there is no native repeat rule ; ICS **import flattens** any recurrence into individual instances (the import result reports `flattenedRecurrenceCount`), and export writes discrete events only.
- **Email / push reminders** — reminders dispatch **in-app only** ; the `calendar.event.reminder` kind is IN_APP-only today.
- **Per-calendar timezone** — events store absolute `Date`s ; there is no per-calendar timezone offset.
