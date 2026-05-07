export { notify, notifyMany, type DispatchResult } from "./dispatch"
export {
  isChannelEnabled,
  listPreferences,
  resolveChannelEnabled,
  resetPreferences,
  setPreference,
  type PrefRow,
} from "./prefs"
export { registerNotificationSubscribers } from "./subscribers"
export { sendMail, type MailMessage, type MailDeliveryResult } from "./transport/email"
export { notificationsRouter } from "./router"
