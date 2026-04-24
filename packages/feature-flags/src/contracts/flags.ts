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
} as const satisfies Record<string, { description: string; defaultOn: boolean; critical?: boolean }>

export type FlagKey = keyof typeof FLAGS

export function isKnownFlag(key: string): key is FlagKey {
  return Object.prototype.hasOwnProperty.call(FLAGS, key)
}

export function listFlagKeys(): FlagKey[] {
  return Object.keys(FLAGS) as FlagKey[]
}

export const FLAG_FLIPPED = "feature-flag.flipped" as const
