export const FLAGS = {
  voting: {
    description: "Decentralized voting module",
    defaultOn: false,
  },
  "contributions.quantification": {
    description: "Contribution estimation + reward surface",
    defaultOn: false,
  },
  "referral.external-sync": {
    description: "Sync with the external referral system",
    defaultOn: false,
  },
  "onboarding.v2": {
    description: "Redesigned onboarding flow",
    defaultOn: false,
  },
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
} as const satisfies Record<string, { description: string; defaultOn: boolean; critical?: boolean }>

export type FlagKey = keyof typeof FLAGS

export function isKnownFlag(key: string): key is FlagKey {
  return Object.prototype.hasOwnProperty.call(FLAGS, key)
}

export function listFlagKeys(): FlagKey[] {
  return Object.keys(FLAGS) as FlagKey[]
}

export const FLAG_FLIPPED = "feature-flag.flipped" as const
