import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions + payload-field metadata for the Calendar
// module's events, so they appear (grouped under "calendar") in the webhooks
// subscription picker and the automation Event Trigger node's outputs.
const CALENDAR_EVENT_TYPES = {
  "calendar.created": {
    description: "A calendar was created.",
    fields: [
      { key: "calendarId", type: "string", description: "The calendar that was created." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the calendar belongs to.",
      },
      { key: "name", type: "string", description: "The calendar's name." },
      { key: "actorId", type: "string", description: "The user who created the calendar." },
    ],
  },
  "calendar.updated": {
    description: "A calendar's name, description, color, or role access changed.",
    fields: [
      { key: "calendarId", type: "string", description: "The calendar that was updated." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the calendar belongs to.",
      },
      { key: "changed", type: "object", description: "Which fields the update set." },
      { key: "actorId", type: "string", description: "The user who updated the calendar." },
    ],
  },
  "calendar.deleted": {
    description: "A calendar was soft-deleted.",
    fields: [
      { key: "calendarId", type: "string", description: "The calendar that was deleted." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the calendar belonged to.",
      },
      { key: "actorId", type: "string", description: "The user who deleted the calendar." },
    ],
  },
  "calendar.event-created": {
    description: "An event was added to a calendar.",
    fields: [
      { key: "eventId", type: "string", description: "The newly created event's id." },
      { key: "calendarId", type: "string", description: "The calendar the event was added to." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the calendar belongs to.",
      },
      { key: "title", type: "string", description: "The event's title." },
      { key: "startAt", type: "date", description: "When the event starts." },
      { key: "endAt", type: "date", description: "When the event ends." },
      { key: "actorId", type: "string", description: "The user who created the event." },
    ],
  },
  "calendar.event-updated": {
    description: "An event's details, schedule, or calendar changed.",
    fields: [
      { key: "eventId", type: "string", description: "The event that was updated." },
      {
        key: "calendarId",
        type: "string",
        description: "The calendar the event currently lives in.",
      },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the calendar belongs to.",
      },
      { key: "changed", type: "object", description: "Which fields the update set." },
      { key: "actorId", type: "string", description: "The user who updated the event." },
    ],
  },
  "calendar.event-deleted": {
    description: "An event was soft-deleted.",
    fields: [
      { key: "eventId", type: "string", description: "The event that was deleted." },
      { key: "calendarId", type: "string", description: "The calendar the event belonged to." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the calendar belongs to.",
      },
      { key: "actorId", type: "string", description: "The user who deleted the event." },
    ],
  },
} as const;

export function registerCalendarEventTypes(): void {
  registerEventTypes("calendar", CALENDAR_EVENT_TYPES);
}
