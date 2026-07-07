import { registerModelIntegration } from "@monark/data-models/server";

// Declares Calendar's two integration slots to the polymorphic Data Models
// engine : an admin maps a Data Model's own fields onto these slots (see
// dataModels.integrations.save), and registerCalendarDataModelSubscriber
// (subscribers.ts) materializes matching records into real CalendarEvent
// rows. See docs/features-planning/phase-2/polymorphic-db.md for why this
// is "mapping, not reserved field keys" — nothing here assumes any
// particular field key name on the admin's Data Model, only that the
// mapped field's *type* satisfies the slot.
export function registerCalendarModelIntegration(): void {
  registerModelIntegration("calendar", {
    description: "Materializes a Data Record onto a Calendar as a real CalendarEvent.",
    slots: {
      time: {
        types: ["DATE", "DATETIME"],
        required: true,
        description:
          "Which field is the event's time. Materializes as a point-in-time (PUNCTUAL) event, not a range.",
      },
      calendarRef: {
        types: ["RELATION"],
        relationTarget: "Calendar",
        required: true,
        description: "Which Calendar this record's event belongs to.",
      },
    },
  });
}
