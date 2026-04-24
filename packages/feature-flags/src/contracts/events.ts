import type { DomainEventBase } from "@monark/common/contracts/events"
import type { FlagKey } from "./flags"

export type FlagScope = {
  organizationId?: string
  userId?: string
  role?: string
}

export type FlagFlippedEvent = DomainEventBase & {
  type: "feature-flag.flipped"
  flagKey: FlagKey
  scope: FlagScope
  enabled: boolean
  actorId: string
}

export type FeatureFlagsEvents = FlagFlippedEvent
