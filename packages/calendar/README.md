# @monark/calendar

Core calendar module. Provides the building blocks for a multi-column Day View: a vertical timeline, per-column event schedules, a real-time current-time indicator, a click-to-create/edit event flow, a sidebar with a mini monthly calendar and calendar list, and full persistence via Prisma + tRPC.

## What's here

- `/contracts` — `CalendarEvent`, `CalendarEventTime`, `ColumnDef`, `DaySchedule`, `CalendarDef` types.
- `/server` — Prisma data layer (`data.ts`), `calendar.view` / `calendar.manage` permissions (`permissions.ts`), and the full `calendarRouter` (calendar CRUD + event CRUD + per-day event listing).
- `/client` — pure React UI primitives (no shadcn imports): `DayTimeline`, `DayDateHeader`, `DayColumnHeader`, `DayColumnsArea`, `DayColumn`, `DaySchedule`, `DayEventBlock`, `CurrentTimeIndicator`, `useCurrentTime`, layout constants `HOUR_HEIGHT_PX` / `TOTAL_HEIGHT_PX`.

The wired page components (`DayView`, `NewEventPopover`, `CalendarSidebar`, `CalendarManageDialog`) and the shadcn mini calendar live in [services/web/src/app/(authed)/calendar/](<../../services/web/src/app/(authed)/calendar/>) because shadcn is scoped to that service.

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

**RBAC** — two permissions registered at boot via `registerCalendarPermissions()`:

| key               | who                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `calendar.view`   | Can see calendars whose role access includes the user's role                                      |
| `calendar.manage` | Can create/edit/delete calendars and assign role access (implicitly bypasses `roleAccess` filter) |

## tRPC procedures

All procedures are under `trpc.calendar.*`.

| procedure           | permission        | description                                          |
| ------------------- | ----------------- | ---------------------------------------------------- |
| `calendars.list`    | `calendar.view`   | Returns calendars visible to the caller              |
| `calendars.create`  | `calendar.manage` | Creates a calendar, optionally sets role access      |
| `calendars.update`  | `calendar.manage` | Updates name/description/color/roleAccess            |
| `calendars.delete`  | `calendar.manage` | Soft-deletes a calendar                              |
| `events.listForDay` | `calendar.view`   | Events across visible calendars for a given ISO date |
| `events.create`     | `calendar.view`   | Creates an event in a visible calendar               |
| `events.update`     | `calendar.view`   | Updates an event (caller must be able to see it)     |
| `events.delete`     | `calendar.view`   | Soft-deletes an event                                |

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
- `@monark/common` — shared event-bus types.
- `@monark/db` — Prisma client (`getDb()`, `Prisma` namespace).
- `@monark/organizations/server` — `requireOrg()`.
- `@monark/rbac/server` — `requirePermission()`, `getUserRoles()`, `hasPermission()`.

No Radix, no shadcn imports inside the package. The mini calendar (`react-day-picker`) lives in `services/web`.

## Operational

No env vars beyond what `@monark/db` already needs (`DATABASE_URL`, `DIRECT_URL`).

Run after schema changes:

```sh
pnpm db:migrate
pnpm db:generate
```

Permissions are registered at API boot via `registerCalendarPermissions()` (called in `services/api/src/server.ts`).

## Events emitted / consumed

None in this phase. Future candidates: `CalendarEventCreated`, `CalendarEventUpdated`, `CalendarEventDeleted` for webhook subscriptions.

## Deferred

- **Week view** — 7-column layout; can reuse `DayColumnsArea` with 7 `ColumnDef` entries.
- **Month view** — grid-calendar layout; separate component family.
- **Multi-day / all-day events** — strip at the top of the column above the hourly grid.
- **Event notifications / reminders** — tRPC mutation to set a reminder, notification kind registration.
- **iCal export** — export a calendar's events as an `.ics` file.
