import { registerEventTypes } from "@monark/common"

const NOTIFICATIONS_EVENT_TYPES = {
  "notification.created": {
    description:
      "A notification row was persisted for a user (one event per delivered channel).",
  },
  "notification.delivery-failed": {
    description:
      "An EMAIL or push delivery failed (SMTP error, rendering failure, transport unreachable). The IN_APP row, if any, was still persisted.",
  },
  "notification.preference-changed": {
    description:
      "The user toggled a (category, channel) preference row, or an admin reset their prefs.",
  },
} as const

export function registerNotificationsEventTypes(): void {
  registerEventTypes("notifications", NOTIFICATIONS_EVENT_TYPES)
}
