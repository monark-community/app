import type { DomainEventBase } from "@monark/common/contracts/events";
import type { NotificationCategory, NotificationChannel } from "@monark/db";
import type { NotificationKind } from "./index";

// Fired by `dispatch.notify()` once the row is persisted (and, for email,
// after the transport accepts the message). Consumers that build live UI
// (header bell badge, inbox refresh) subscribe to this.
export type NotificationCreatedEvent = DomainEventBase & {
  type: "notification.created";
  userId: string;
  kind: NotificationKind;
  category: NotificationCategory;
  channel: NotificationChannel;
  notificationId: string;
};

// Fired when an EMAIL/PUSH transport rejects a delivery. Ops dashboards /
// alerting subscribe ; signals SMTP outage or template render failure.
export type NotificationDeliveryFailedEvent = DomainEventBase & {
  type: "notification.delivery-failed";
  userId: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  notificationId: string;
  reason: string;
};

// Fired when a user toggles a per-kind-per-channel preference. Lets the
// audit log capture compliance-relevant changes (opt-out of a specific
// account email, etc.).
export type NotificationPreferenceChangedEvent = DomainEventBase & {
  type: "notification.preference-changed";
  userId: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  enabled: boolean;
};

export type NotificationsEvents =
  | NotificationCreatedEvent
  | NotificationDeliveryFailedEvent
  | NotificationPreferenceChangedEvent;
