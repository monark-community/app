import { registerPermissions } from "@monark/rbac/server";

const USERS_PERMISSIONS = {
  disable: {
    description: "Disable user accounts (admin lockout).",
    category: "users",
  },
  "manage-profile": {
    description: "Edit other users' profile fields (display name, bio, avatar, locale).",
    category: "users",
  },
} as const;

export function registerUsersPermissions(): void {
  registerPermissions("users", USERS_PERMISSIONS);
}
