import type { DomainEventBase } from "@monark/common/contracts/events"

export type UserProfileUpdatedEvent = DomainEventBase & {
  type: "user.profile-updated"
  userId: string
  changed: Array<"displayName" | "avatarUrl" | "localePreference">
}

export type UserEmailChangedEvent = DomainEventBase & {
  type: "user.email-changed"
  userId: string
  previousEmail: string
  newEmail: string
}

// Stamped when a user requests account deletion; hard-delete runs after
// the grace window. `deletionCompletesAt` is `deletedAt + 14d`.
export type UserDeletionRequestedEvent = DomainEventBase & {
  type: "user.deletion-requested"
  userId: string
  deletionCompletesAt: Date
}

export type UserDeletionCanceledEvent = DomainEventBase & {
  type: "user.deletion-canceled"
  userId: string
}

export type UsersEvents =
  | UserProfileUpdatedEvent
  | UserEmailChangedEvent
  | UserDeletionRequestedEvent
  | UserDeletionCanceledEvent
