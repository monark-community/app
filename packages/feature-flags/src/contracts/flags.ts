export const FLAGS = {
  "auth.trusted-devices": {
    description:
      "Track trusted devices on sign-in (cookie + DB rows). Kill switch for the whole subsystem; when off, no recognition or persistence happens.",
    defaultOn: true,
  },
  "auth.totp-trust-devices": {
    description:
      "Let a previously-TOTP-verified device skip the challenge on subsequent sign-ins. Off ⇒ TOTP is always challenged, even on recognized devices.",
    defaultOn: true,
  },
  "auth.totp-required-admin": {
    description:
      "Enforce TOTP enrollment for admin roles within 7 days of first sign-in.",
    defaultOn: true,
  },
  "tenancy.multi-tenant": {
    description:
      "When ON, the app accepts multiple organizations and self-service org creation. When OFF (default), the app runs in single-tenant mode : exactly one Organization is expected, every route gates to /setup until that org exists, and the admin UX collapses around the single-org assumption.",
    defaultOn: false,
  },
} as const satisfies Record<string, { description: string; defaultOn: boolean; critical?: boolean }>

export type FlagKey = keyof typeof FLAGS

export function isKnownFlag(key: string): key is FlagKey {
  return Object.prototype.hasOwnProperty.call(FLAGS, key)
}

export function listFlagKeys(): FlagKey[] {
  return Object.keys(FLAGS) as FlagKey[]
}

export const FLAG_FLIPPED = "feature-flag.flipped" as const
