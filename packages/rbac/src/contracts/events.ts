import type { DomainEventBase } from "@monark/common/contracts/events";

// `roleId` references the `Role` table ; `roleKey` is duplicated on
// the event so subscribers (audit logs, notification fan-out) don't
// have to round-trip back to the DB to learn which role was rotated.
// `grantedById` is undefined for system-driven grants (the sysadmin
// CLI bootstrapping the first SYSADMIN, etc.) — UI flows always
// carry an actor.
export type RoleAssignedEvent = DomainEventBase & {
  type: "rbac.role-assigned";
  assignmentId: string;
  userId: string;
  organizationId: string | null;
  roleId: string;
  roleKey: string;
  grantedById?: string;
  reason?: string;
};

// `revokedById` is undefined for system-driven revokes (the sysadmin
// CLI revoking a role outside any UI session).
export type RoleRevokedEvent = DomainEventBase & {
  type: "rbac.role-revoked";
  assignmentId: string;
  userId: string;
  organizationId: string | null;
  roleId: string;
  roleKey: string;
  revokedById?: string;
  reason?: string;
};

export type RoleCreatedEvent = DomainEventBase & {
  type: "rbac.role-created";
  roleId: string;
  roleKey: string;
  organizationId: string | null;
  createdById: string;
};

export type RoleUpdatedEvent = DomainEventBase & {
  type: "rbac.role-updated";
  roleId: string;
  organizationId: string | null;
  changed: Array<"name" | "description" | "color" | "permissions">;
  actorId: string;
};

export type RoleDeletedEvent = DomainEventBase & {
  type: "rbac.role-deleted";
  roleId: string;
  organizationId: string | null;
  actorId: string;
};

export type RbacEvents =
  | RoleAssignedEvent
  | RoleRevokedEvent
  | RoleCreatedEvent
  | RoleUpdatedEvent
  | RoleDeletedEvent;
