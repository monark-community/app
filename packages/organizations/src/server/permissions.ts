import { registerPermissions } from "@monark/rbac/server";

const ORG_PERMISSIONS = {
  "update-settings": {
    description: "Edit organization profile (name, slug, logo, brand color).",
    category: "organization",
  },
  "invite-member": {
    description: "Send invites to new members.",
    category: "users",
  },
  "remove-member": {
    description: "Remove existing members from the organization.",
    category: "users",
  },
} as const;

export function registerOrganizationsPermissions(): void {
  registerPermissions("organizations", ORG_PERMISSIONS);
}
