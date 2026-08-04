import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the kanban module (namespace `kanban.*`).
const KANBAN_FLAGS = {
  board: {
    description:
      "The Kanban board view. Kill switch for the whole feature ; when off, the /kanban route and its primary-nav entry are hidden.",
    defaultOn: true,
  },
  query: {
    description:
      "MonarkQL filtering on the Kanban board (the query bar + `cards.list` filter). When off, the board loads all cards and the bar is hidden.",
    defaultOn: false,
  },
} as const;

export function registerKanbanFeatureFlags(): void {
  registerFlags("kanban", KANBAN_FLAGS);
}
