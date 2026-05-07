// Client-side surface intentionally empty for the MVP. The web service
// reaches the in-app inbox + preferences via the tRPC `notifications`
// router (registered server-side in `notificationsRouter`), so no
// dedicated React hooks are needed yet ; consumers use
// `trpc.notifications.*` directly.
//
// Hooks like `useUnreadCount`, `useNotifications`, `useNotificationPreferences`
// will land here when we want to centralise polling / subscription logic
// across multiple call sites.
export {}
