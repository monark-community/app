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

// Emitted by the hard-delete worker after the 14-day grace window. By the
// time consumers see this, the email/displayName/avatar fields have been
// anonymized and the Supabase auth row has been removed; the userId itself
// stays valid so foreign-key references (votes, contributions) can be
// rewritten to "Deleted User" rather than cascade-deleted.
export type UserDeletedEvent = DomainEventBase & {
  type: "user.deleted"
  userId: string
  previousEmail: string
}

export type UsersEvents =
  | UserProfileUpdatedEvent
  | UserEmailChangedEvent
  | UserDeletionRequestedEvent
  | UserDeletionCanceledEvent
  | UserDeletedEvent
