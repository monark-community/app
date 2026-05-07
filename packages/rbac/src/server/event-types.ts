import { registerEventTypes } from "@monark/common"

const RBAC_EVENT_TYPES = {
  "rbac.role-assigned": {
    description:
      "A role was granted to a user (UI grant, invite acceptance, or sysadmin CLI bootstrap). Skipped on idempotent re-grants where the user already had the role active.",
  },
  "rbac.role-revoked": {
    description: "A role assignment was revoked, either by an admin or by a user leaving an org.",
  },
  "rbac.role-created": {
    description: "An admin created a custom role inside their organization.",
  },
  "rbac.role-updated": {
    description:
      "A custom role's name / description / color / permission set was edited.",
  },
  "rbac.role-deleted": {
    description:
      "A custom role was deleted. Only fires when no active assignments remain — the API hard-blocks deletion otherwise.",
  },
} as const

export function registerRbacEventTypes(): void {
  registerEventTypes("rbac", RBAC_EVENT_TYPES)
}
