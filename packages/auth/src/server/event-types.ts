import { registerEventTypes } from "@monark/common";

const AUTH_EVENT_TYPES = {
  "user.signed-up": {
    description:
      "A new account was created. Fires once per user, after the row is committed but before email verification.",
  },
  "user.signed-in": {
    description: "A user authenticated successfully. Fires every sign-in.",
  },
  "user.signed-out": {
    description: "A user explicitly signed out (their session was revoked).",
  },
  "user.password-changed": {
    description:
      "The user's password was rotated. Fires for both self-service and admin-initiated resets.",
  },
  "user.email-verified": {
    description:
      "The user clicked the confirmation link / entered the OTP and their email is now verified.",
  },
  "trusted-device.added": {
    description: "A new device was recognized + persisted on first sign-in from that device.",
  },
  "trusted-device.revoked": {
    description: "A specific trusted device's cookie was revoked.",
  },
  "trusted-devices.all-revoked": {
    description:
      "Every trusted device for a user was revoked in a single sweep (e.g. password change).",
  },
  "totp.enabled": {
    description: "The user confirmed TOTP enrollment. Their account now requires a second factor.",
  },
  "totp.disabled": {
    description:
      "TOTP was turned off (either by the user with their password, or by an admin reset).",
  },
  "totp.recovery-code-used": {
    description: "A recovery code was consumed (one-time, can never be re-used).",
  },
  "totp.recovery-codes-regenerated": {
    description:
      "The user regenerated their two-factor recovery codes ; the previous batch was invalidated.",
  },
} as const;

export function registerAuthEventTypes(): void {
  registerEventTypes("auth", AUTH_EVENT_TYPES);
}
