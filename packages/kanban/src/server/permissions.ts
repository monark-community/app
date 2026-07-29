import { registerPermissions } from "@monark/rbac/server";

const KANBAN_PERMISSIONS = {
  view: {
    description: "View Kanban boards and their cards the user's role has access to.",
    category: "kanban",
  },
  create: {
    description: "Create new Kanban boards.",
    category: "kanban",
  },
  edit: {
    description: "Edit boards, columns, and cards (create / move / update cards, rename columns).",
    category: "kanban",
  },
  delete: {
    description: "Delete boards and cards.",
    category: "kanban",
  },
  manage: {
    description: "Full Kanban management including board role-access control.",
    category: "kanban",
  },
} as const;

export function registerKanbanPermissions(): void {
  registerPermissions("kanban", KANBAN_PERMISSIONS);
}
