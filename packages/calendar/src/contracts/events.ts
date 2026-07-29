import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events emitted by the Calendar module. Every state-changing mutation
// emits one so other modules, the webhook outbox, and the automation system can
// react without coupling. `actorId` is the user who performed the action ; ids
// let a subscriber load whatever it needs without the event carrying the row.
// `changed` on an update lists which fields the request set (its intent), so a
// subscriber can filter (e.g. react only to a reschedule).

export type CalendarCreatedEvent = DomainEventBase & {
  type: "calendar.created";
  calendarId: string;
  organizationId: string;
  name: string;
  actorId: string;
};

export type CalendarUpdatedEvent = DomainEventBase & {
  type: "calendar.updated";
  calendarId: string;
  organizationId: string;
  changed: Array<"name" | "description" | "color" | "roleAccess">;
  actorId: string;
};

export type CalendarDeletedEvent = DomainEventBase & {
  type: "calendar.deleted";
  calendarId: string;
  organizationId: string;
  actorId: string;
};

export type CalendarEventCreatedEvent = DomainEventBase & {
  type: "calendar.event-created";
  eventId: string;
  calendarId: string;
  organizationId: string;
  title: string;
  /** ISO-8601 start / end of the event. */
  startAt: string;
  endAt: string;
  actorId: string;
};

export type CalendarEventUpdatedEvent = DomainEventBase & {
  type: "calendar.event-updated";
  eventId: string;
  calendarId: string;
  organizationId: string;
  changed: Array<
    | "title"
    | "description"
    | "location"
    | "participants"
    | "startAt"
    | "endAt"
    | "reminders"
    | "eventType"
    | "calendar"
  >;
  actorId: string;
};

export type CalendarEventDeletedEvent = DomainEventBase & {
  type: "calendar.event-deleted";
  eventId: string;
  calendarId: string;
  organizationId: string;
  actorId: string;
};

export type CalendarEvents =
  | CalendarCreatedEvent
  | CalendarUpdatedEvent
  | CalendarDeletedEvent
  | CalendarEventCreatedEvent
  | CalendarEventUpdatedEvent
  | CalendarEventDeletedEvent;
