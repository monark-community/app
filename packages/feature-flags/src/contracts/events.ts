import type { DomainEventBase } from "@monark/common/contracts/events"
import type { FlagKey } from "./flags"

// `roleId` references the `Role` table ; the previous enum-based field
// disappeared with the table-driven RBAC migration. Role-scoped flag
// overrides target every user holding any active assignment to that
// role row.
export type FlagScope = {
  organizationId?: string
  userId?: string
  roleId?: string
}

export type FlagFlippedEvent = DomainEventBase & {
  type: "feature-flag.flipped"
  flagKey: FlagKey
  scope: FlagScope
  enabled: boolean
  actorId: string
}

export type FeatureFlagsEvents = FlagFlippedEvent
