import { registerEventTypes } from "@monark/common";

const NOTIFICATIONS_EVENT_TYPES = {
  "notification.created": {
    description: "A notification row was persisted for a user (one event per delivered channel).",
    fields: [
      { key: "userId", type: "string", description: "The user the notification was created for." },
      { key: "kind", type: "string", description: "The notification kind." },
      { key: "category", type: "string", description: "The notification's category." },
      { key: "channel", type: "string", description: "The channel it was delivered on." },
      {
        key: "notificationId",
        type: "string",
        description: "The persisted notification row's id.",
      },
    ],
  },
  "notification.delivery-failed": {
    description:
      "An EMAIL or push delivery failed (SMTP error, rendering failure, transport unreachable). The IN_APP row, if any, was still persisted.",
    fields: [
      { key: "userId", type: "string", description: "The user the delivery was for." },
      { key: "kind", type: "string", description: "The notification kind that failed." },
      { key: "channel", type: "string", description: "The channel that rejected delivery." },
      { key: "notificationId", type: "string", description: "The notification row's id." },
      { key: "reason", type: "string", description: "Why the delivery failed." },
    ],
  },
  "notification.preference-changed": {
    description:
      "The user toggled a (category, channel) preference row, or an admin reset their prefs.",
    fields: [
      { key: "userId", type: "string", description: "The user whose preference changed." },
      { key: "kind", type: "string", description: "The notification kind the preference is for." },
      { key: "channel", type: "string", description: "The channel the preference is for." },
      { key: "enabled", type: "boolean", description: "The new on/off value of the preference." },
    ],
  },
} as const;

export function registerNotificationsEventTypes(): void {
  registerEventTypes("notifications", NOTIFICATIONS_EVENT_TYPES);
}
