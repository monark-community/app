import type { DomainEventBase } from "@monark/common/contracts/events";

export type UserSignedUpEvent = DomainEventBase & {
  type: "user.signed-up";
  userId: string;
  email: string;
  referralCode?: string;
  /**
   * Which social provider registered the account (`google`, `azure`,
   * `github`). Absent for the email + password path, which is what an
   * omitted value means to a subscriber ; it is never set to a
   * "password" sentinel.
   */
  provider?: string;
};

export type UserSignedInEvent = DomainEventBase & {
  type: "user.signed-in";
  userId: string;
  trustedDeviceId?: string;
};

export type UserSignedOutEvent = DomainEventBase & {
  type: "user.signed-out";
  userId: string;
  scope: "local" | "global";
};

export type PasswordChangedEvent = DomainEventBase & {
  type: "user.password-changed";
  userId: string;
  triggeredBy: "user" | "reset";
};

export type EmailVerifiedEvent = DomainEventBase & {
  type: "user.email-verified";
  userId: string;
  email: string;
};

export type TrustedDeviceAddedEvent = DomainEventBase & {
  type: "trusted-device.added";
  userId: string;
  deviceId: string;
  userAgent: string;
  country?: string;
};

export type TrustedDeviceRevokedEvent = DomainEventBase & {
  type: "trusted-device.revoked";
  userId: string;
  deviceId: string;
  scope: "user" | "admin";
  /**
   * True when this revoke is one row of a bulk "revoke every device"
   * sweep (see `revokeAllTrustedDevices`). Notification subscribers skip
   * the per-device email in that case so the user gets a single
   * `auth.all-devices-revoked` message instead of N receipts.
   */
  bulk?: boolean;
};

export type TrustedDevicesAllRevokedEvent = DomainEventBase & {
  type: "trusted-devices.all-revoked";
  userId: string;
  count: number;
  scope: "user" | "admin";
};

export type TotpEnabledEvent = DomainEventBase & {
  type: "totp.enabled";
  userId: string;
};

export type TotpDisabledEvent = DomainEventBase & {
  type: "totp.disabled";
  userId: string;
  triggeredBy: "user" | "admin";
};

export type TotpRecoveryCodeUsedEvent = DomainEventBase & {
  type: "totp.recovery-code-used";
  userId: string;
  remainingCodes: number;
};

export type TotpRecoveryCodesRegeneratedEvent = DomainEventBase & {
  type: "totp.recovery-codes-regenerated";
  userId: string;
  /** How many fresh codes were issued (old codes are invalidated). */
  count: number;
};

export type AuthEvents =
  | UserSignedUpEvent
  | UserSignedInEvent
  | UserSignedOutEvent
  | PasswordChangedEvent
  | EmailVerifiedEvent
  | TrustedDeviceAddedEvent
  | TrustedDeviceRevokedEvent
  | TrustedDevicesAllRevokedEvent
  | TotpEnabledEvent
  | TotpDisabledEvent
  | TotpRecoveryCodeUsedEvent
  | TotpRecoveryCodesRegeneratedEvent;
