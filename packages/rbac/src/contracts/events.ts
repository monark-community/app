import type { DomainEventBase } from "@monark/common/contracts/events"
import type { Role } from "./role"

export type RoleAssignedEvent = DomainEventBase & {
  type: "rbac.role-assigned"
  assignmentId: string
  userId: string
  organizationId: string | null
  role: Role
  grantedById: string
  reason?: string
}

export type RoleRevokedEvent = DomainEventBase & {
  type: "rbac.role-revoked"
  assignmentId: string
  userId: string
  organizationId: string | null
  role: Role
  revokedById: string
  reason?: string
}

export type RbacEvents = RoleAssignedEvent | RoleRevokedEvent
