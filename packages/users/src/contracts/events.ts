import type { DomainEventBase } from "@monark/common/contracts/events"

export type UserProfileUpdatedEvent = DomainEventBase & {
  type: "user.profile-updated"
  userId: string
  changed: Array<"displayName" | "avatarUrl" | "localePreference">
}

// Additional event types (USER_EMAIL_CHANGED, USER_DELETION_REQUESTED, etc.)
// land when their corresponding flows ship. See
// docs/features-planning/phase-1/user-management.md.

export type UsersEvents = UserProfileUpdatedEvent
