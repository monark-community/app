import { registerNotificationKind } from "@monark/notifications/server";

let registered = false;

export function registerCalendarNotificationKinds(): void {
  if (registered) return;
  registered = true;

  registerNotificationKind(
    "calendar.event.reminder",
    {
      category: "ACTIVITY",
      channels: ["IN_APP"],
      defaultEnabled: { IN_APP: true },
      requiredEmail: false,
      template: "calendar/event-reminder",
    },
    {
      en: {
        subject: "Reminder: {{ eventTitle }}",
        html: "",
        text: "",
        inapp: {
          subject: "Reminder: {{ eventTitle }}",
          body: "Starting in {{ minutesLabel }}",
          link: "/calendar?view=day&date={{ startAtMs }}&event={{ eventId }}",
        },
      },
      fr: {
        subject: "Rappel : {{ eventTitle }}",
        html: "",
        text: "",
        inapp: {
          subject: "Rappel : {{ eventTitle }}",
          body: "Commence dans {{ minutesLabel }}",
          link: "/calendar?view=day&date={{ startAtMs }}&event={{ eventId }}",
        },
      },
    },
  );
}
