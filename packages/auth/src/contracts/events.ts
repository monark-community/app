import type { DomainEventBase } from "@monark/common/contracts/events"

export type UserSignedUpEvent = DomainEventBase & {
  type: "user.signed-up"
  userId: string
  email: string
  referralCode?: string
}

export type UserSignedInEvent = DomainEventBase & {
  type: "user.signed-in"
  userId: string
  trustedDeviceId?: string
}

export type UserSignedOutEvent = DomainEventBase & {
  type: "user.signed-out"
  userId: string
  scope: "local" | "global"
}

export type PasswordChangedEvent = DomainEventBase & {
  type: "user.password-changed"
  userId: string
  triggeredBy: "user" | "reset"
}

export type AuthEvents =
  | UserSignedUpEvent
  | UserSignedInEvent
  | UserSignedOutEvent
  | PasswordChangedEvent
