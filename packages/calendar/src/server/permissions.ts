import { registerPermissions } from "@monark/rbac/server";

const CALENDAR_PERMISSIONS = {
  view: {
    description: "View calendars and their events the user's role has access to.",
    category: "calendar",
  },
  create: {
    description: "Create new calendars.",
    category: "calendar",
  },
  edit: {
    description: "Edit calendar name, description, and color.",
    category: "calendar",
  },
  delete: {
    description: "Delete calendars (personal calendar is protected).",
    category: "calendar",
  },
  manage: {
    description: "Full calendar management including role access control.",
    category: "calendar",
  },
} as const;

// Registered for registry/admin-tooling hygiene (per app/CLAUDE.md's metadata
// sidecar convention). Calendar's own settings.get/set/reset procedures never
// check these : a user's own view settings are self-owned data, gated on
// ctx.userId only.
const CALENDAR_SETTINGS_METADATA_PERMISSIONS = {
  "read-metadata-for-module-calendar": {
    description: "Read a user's calendar view settings via the metadata sidecar.",
    category: "calendar",
  },
  "write-metadata-for-module-calendar": {
    description: "Write a user's calendar view settings via the metadata sidecar.",
    category: "calendar",
  },
} as const;

export function registerCalendarPermissions(): void {
  registerPermissions("calendar", CALENDAR_PERMISSIONS);
  registerPermissions("users", CALENDAR_SETTINGS_METADATA_PERMISSIONS);
}
