export { notify, notifyMany, type DispatchResult } from "./dispatch";
export {
  isChannelEnabled,
  listPreferences,
  resolveChannelEnabled,
  resetPreferences,
  setPreference,
  type PrefRow,
} from "./prefs";
export { registerNotificationSubscribers, _resetSubscribersForTesting } from "./subscribers";
export { sendMail, type MailMessage, type MailDeliveryResult } from "./transport/email";
export { notificationsRouter } from "./router";
export { registerCoreNotificationKinds } from "./register-core-kinds";
export { registerNotificationsEventTypes } from "./event-types";
export {
  registerNotificationKind,
  getNotificationKindDef,
  getNotificationTemplate,
  isKnownNotificationKind,
  listNotificationKinds,
  listNotificationKindDescriptors,
} from "../contracts/registry";
export type {
  NotificationKind,
  NotificationKindDef,
  NotificationDataMap,
  NotificationDataRegistry,
} from "../contracts/registry";
