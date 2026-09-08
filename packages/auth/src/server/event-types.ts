import { registerEventTypes } from "@monark/common";

const AUTH_EVENT_TYPES = {
  "user.signed-up": {
    description:
      "A new account was created. Fires once per user, after the row is committed but before email verification.",
    fields: [
      { key: "userId", type: "string", description: "The user whose account was created." },
      {
        key: "email",
        type: "string",
        description: "The email address the account signed up with.",
      },
      {
        key: "referralCode",
        type: "string",
        description: "Optional referral code used at signup.",
      },
      {
        key: "provider",
        type: "string",
        description:
          "Social provider the account registered through (google, azure, github). Absent for email + password signups.",
      },
    ],
  },
  "user.signed-in": {
    description: "A user authenticated successfully. Fires every sign-in.",
    fields: [
      { key: "userId", type: "string", description: "The user who authenticated." },
      {
        key: "trustedDeviceId",
        type: "string",
        description: "Optional trusted device the sign-in came from.",
      },
    ],
  },
  "user.signed-out": {
    description: "A user explicitly signed out (their session was revoked).",
    fields: [
      { key: "userId", type: "string", description: "The user who signed out." },
      {
        key: "scope",
        type: "string",
        description: "Whether one session or all sessions were revoked.",
      },
    ],
  },
  "user.password-changed": {
    description:
      "The user's password was rotated. Fires for both self-service and admin-initiated resets.",
    fields: [
      { key: "userId", type: "string", description: "The user whose password was rotated." },
      {
        key: "triggeredBy",
        type: "string",
        description: "Whether the user changed it or a reset flow did.",
      },
    ],
  },
  "user.email-verified": {
    description:
      "The user clicked the confirmation link / entered the OTP and their email is now verified.",
    fields: [
      { key: "userId", type: "string", description: "The user whose email was verified." },
      { key: "email", type: "string", description: "The email address now verified." },
    ],
  },
  "trusted-device.added": {
    description: "A new device was recognized + persisted on first sign-in from that device.",
    fields: [
      { key: "userId", type: "string", description: "The user the device was recognized for." },
      { key: "deviceId", type: "string", description: "The newly trusted device's id." },
      { key: "userAgent", type: "string", description: "The device's browser user-agent string." },
      { key: "country", type: "string", description: "Optional country the device was seen from." },
    ],
  },
  "trusted-device.revoked": {
    description: "A specific trusted device's cookie was revoked.",
    fields: [
      { key: "userId", type: "string", description: "The user whose device was revoked." },
      { key: "deviceId", type: "string", description: "The trusted device that was revoked." },
      { key: "scope", type: "string", description: "Whether the user or an admin revoked it." },
      {
        key: "bulk",
        type: "boolean",
        description: "True when part of a revoke-all-devices sweep.",
      },
    ],
  },
  "trusted-devices.all-revoked": {
    description:
      "Every trusted device for a user was revoked in a single sweep (e.g. password change).",
    fields: [
      { key: "userId", type: "string", description: "The user whose devices were all revoked." },
      { key: "count", type: "number", description: "How many devices were revoked in the sweep." },
      {
        key: "scope",
        type: "string",
        description: "Whether the user or an admin triggered the sweep.",
      },
    ],
  },
  "totp.enabled": {
    description: "The user confirmed TOTP enrollment. Their account now requires a second factor.",
    fields: [{ key: "userId", type: "string", description: "The user who enrolled in TOTP." }],
  },
  "totp.disabled": {
    description:
      "TOTP was turned off (either by the user with their password, or by an admin reset).",
    fields: [
      { key: "userId", type: "string", description: "The user whose TOTP was disabled." },
      {
        key: "triggeredBy",
        type: "string",
        description: "Whether the user or an admin turned it off.",
      },
    ],
  },
  "totp.recovery-code-used": {
    description: "A recovery code was consumed (one-time, can never be re-used).",
    fields: [
      { key: "userId", type: "string", description: "The user who consumed a recovery code." },
      {
        key: "remainingCodes",
        type: "number",
        description: "How many recovery codes remain unused.",
      },
    ],
  },
  "oauth.provider-linked": {
    description:
      "A social provider was connected to an existing account (from account settings, or by Supabase's own verified-email identity matching at sign-in).",
    fields: [
      { key: "userId", type: "string", description: "The user the provider was linked to." },
      {
        key: "provider",
        type: "string",
        description: "Supabase provider slug (github, google, azure).",
      },
    ],
  },
  "oauth.provider-unlinked": {
    description:
      "A social provider was disconnected from an account. Security-relevant: it changes which credentials can reach the account.",
    fields: [
      { key: "userId", type: "string", description: "The user the provider was unlinked from." },
      { key: "provider", type: "string", description: "Supabase provider slug that was removed." },
      {
        key: "remainingProviders",
        type: "number",
        description: "How many social providers are still linked afterwards.",
      },
      {
        key: "hasPassword",
        type: "boolean",
        description: "Whether an email + password credential still exists on the account.",
      },
    ],
  },
  "totp.recovery-codes-regenerated": {
    description:
      "The user regenerated their two-factor recovery codes ; the previous batch was invalidated.",
    fields: [
      {
        key: "userId",
        type: "string",
        description: "The user who regenerated their recovery codes.",
      },
      { key: "count", type: "number", description: "How many fresh recovery codes were issued." },
    ],
  },
} as const;

export function registerAuthEventTypes(): void {
  registerEventTypes("auth", AUTH_EVENT_TYPES);
}
