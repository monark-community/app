import authNewDevice from "./auth/new-device"
import authPasswordChanged from "./auth/password-changed"
import authTotpEnabled from "./auth/totp-enabled"
import authTotpDisabled from "./auth/totp-disabled"
import authAllDevicesRevoked from "./auth/all-devices-revoked"
import accountEmailChanged from "./account/email-changed"
import accountDeletionScheduled from "./account/deletion-scheduled"
import accountDeletionCanceled from "./account/deletion-canceled"
import type { KindMessages } from "./types"

/**
 * Static registry mapping the `template` field on `NOTIFICATION_KINDS`
 * to its loaded `KindMessages`. Static so Next.js bundles the templates
 * at build time ; no fs/dynamic-import surprises.
 */
export const TEMPLATES: Record<string, KindMessages> = {
  "auth/new-device": authNewDevice,
  "auth/password-changed": authPasswordChanged,
  "auth/totp-enabled": authTotpEnabled,
  "auth/totp-disabled": authTotpDisabled,
  "auth/all-devices-revoked": authAllDevicesRevoked,
  "account/email-changed": accountEmailChanged,
  "account/deletion-scheduled": accountDeletionScheduled,
  "account/deletion-canceled": accountDeletionCanceled,
}

export { EMAIL_SHELL } from "./_partials/email-shell"
export type { KindMessages, LocaleMessage } from "./types"
