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

export type EmailVerifiedEvent = DomainEventBase & {
  type: "user.email-verified"
  userId: string
  email: string
}

export type TrustedDeviceAddedEvent = DomainEventBase & {
  type: "trusted-device.added"
  userId: string
  deviceId: string
  userAgent: string
  country?: string
}

export type TrustedDeviceRevokedEvent = DomainEventBase & {
  type: "trusted-device.revoked"
  userId: string
  deviceId: string
  scope: "user" | "admin"
}

export type TotpEnabledEvent = DomainEventBase & {
  type: "totp.enabled"
  userId: string
}

export type TotpDisabledEvent = DomainEventBase & {
  type: "totp.disabled"
  userId: string
  triggeredBy: "user" | "admin"
}

export type TotpRecoveryCodeUsedEvent = DomainEventBase & {
  type: "totp.recovery-code-used"
  userId: string
  remainingCodes: number
}

export type AuthEvents =
  | UserSignedUpEvent
  | UserSignedInEvent
  | UserSignedOutEvent
  | PasswordChangedEvent
  | EmailVerifiedEvent
  | TrustedDeviceAddedEvent
  | TrustedDeviceRevokedEvent
  | TotpEnabledEvent
  | TotpDisabledEvent
  | TotpRecoveryCodeUsedEvent
