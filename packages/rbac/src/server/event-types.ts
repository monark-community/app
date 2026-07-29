import { registerEventTypes } from "@monark/common";

const RBAC_EVENT_TYPES = {
  "rbac.role-assigned": {
    description:
      "A role was granted to a user (UI grant, invite acceptance, or sysadmin CLI bootstrap). Skipped on idempotent re-grants where the user already had the role active.",
    fields: [
      { key: "assignmentId", type: "string", description: "The role assignment record's id." },
      { key: "userId", type: "string", description: "The user the role was granted to." },
      {
        key: "organizationId",
        type: "string",
        description: "The org scope, or null for platform-tier.",
      },
      { key: "roleId", type: "string", description: "The role that was granted." },
      {
        key: "roleKey",
        type: "string",
        description: "The granted role's key, duplicated for convenience.",
      },
      {
        key: "grantedById",
        type: "string",
        description: "Who granted it; absent for system-driven grants.",
      },
      { key: "reason", type: "string", description: "Optional reason recorded for the grant." },
    ],
  },
  "rbac.role-revoked": {
    description: "A role assignment was revoked, either by an admin or by a user leaving an org.",
    fields: [
      { key: "assignmentId", type: "string", description: "The revoked assignment record's id." },
      { key: "userId", type: "string", description: "The user the role was revoked from." },
      {
        key: "organizationId",
        type: "string",
        description: "The org scope, or null for platform-tier.",
      },
      { key: "roleId", type: "string", description: "The role that was revoked." },
      {
        key: "roleKey",
        type: "string",
        description: "The revoked role's key, duplicated for convenience.",
      },
      {
        key: "revokedById",
        type: "string",
        description: "Who revoked it; absent for system-driven revokes.",
      },
      { key: "reason", type: "string", description: "Optional reason recorded for the revoke." },
    ],
  },
  "rbac.role-created": {
    description: "An admin created a custom role inside their organization.",
    fields: [
      { key: "roleId", type: "string", description: "The newly created role's id." },
      { key: "roleKey", type: "string", description: "The new role's key." },
      {
        key: "organizationId",
        type: "string",
        description: "The org scope, or null for platform-tier.",
      },
      { key: "createdById", type: "string", description: "The admin who created the role." },
    ],
  },
  "rbac.role-updated": {
    description: "A custom role's name / description / color / permission set was edited.",
    fields: [
      { key: "roleId", type: "string", description: "The role that was updated." },
      {
        key: "organizationId",
        type: "string",
        description: "The org scope, or null for platform-tier.",
      },
      { key: "changed", type: "object", description: "List of role fields that changed." },
      { key: "actorId", type: "string", description: "The admin who edited the role." },
    ],
  },
  "rbac.role-deleted": {
    description:
      "A custom role was deleted. Only fires when no active assignments remain — the API hard-blocks deletion otherwise.",
    fields: [
      { key: "roleId", type: "string", description: "The role that was deleted." },
      {
        key: "organizationId",
        type: "string",
        description: "The org scope, or null for platform-tier.",
      },
      { key: "actorId", type: "string", description: "The admin who deleted the role." },
    ],
  },
} as const;

export function registerRbacEventTypes(): void {
  registerEventTypes("rbac", RBAC_EVENT_TYPES);
}
