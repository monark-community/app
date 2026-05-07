import type { DomainEventBase } from "@monark/common/contracts/events"
import type { FlagScope } from "./flags"

// `roleId` references the `Role` table ; role-scoped flag overrides
// target every user holding any active assignment to that role row.
export type { FlagScope }

export type FlagFlippedEvent = DomainEventBase & {
  type: "feature-flag.flipped"
  // Module + key pair identify the flag. Subscribers (webhooks etc.)
  // filter on `module` to scope routing without parsing the dotted
  // form.
  module: string
  flagKey: string
  scope: FlagScope
  enabled: boolean
  actorId: string
}

export type FeatureFlagsEvents = FlagFlippedEvent
