import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the kanban module (namespace `kanban.*`).
const KANBAN_FLAGS = {
  board: {
    description:
      "The Kanban board view. Kill switch for the whole feature ; when off, the /kanban route and its primary-nav entry are hidden.",
    defaultOn: true,
  },
} as const;

export function registerKanbanFeatureFlags(): void {
  registerFlags("kanban", KANBAN_FLAGS);
}
