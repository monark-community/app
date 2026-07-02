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

export function registerCalendarPermissions(): void {
  registerPermissions("calendar", CALENDAR_PERMISSIONS);
}
