import { NotificationsSection } from "../notifications-section"

/**
 * Account → Notifications tab : per-user notification preferences
 * (channel × category toggle matrix). The notifications *inbox*
 * (received messages list) lives in the AppBar bell drawer ; this
 * page is settings only.
 */
export default function AccountNotificationsPage() {
  return <NotificationsSection />
}
