import { FolderKanban, Tags, type LucideIcon } from "lucide-react";

export type DataTab = {
  id: "projects" | "industries";
  href: `/data/${string}`;
  icon: LucideIcon;
  /**
   * Dotted permission that gates this model's route. The sidebar lists
   * only the models the user can read ; the model's own route layout
   * still enforces the same check (this is a UX affordance, not the
   * security boundary).
   */
  permission: string;
};

/**
 * The Data section's tab order. Single source of truth shared by the
 * DataSidebar (renders one entry per data model, marks the active one)
 * and the `/data` index page (server-redirects to the *first* model so
 * the user lands on something actionable instead of a blank shell).
 *
 * Each data model is a module-level surface gated by its own
 * `<model>.read` permission at the model's route layout ; the tab list
 * itself is unconditional (mirrors how the primary nav listed these
 * surfaces before they were grouped under Data).
 */
export const DATA_TABS: ReadonlyArray<DataTab> = [
  { id: "projects", href: "/data/projects", icon: FolderKanban, permission: "projects.read" },
  { id: "industries", href: "/data/industries", icon: Tags, permission: "industries.read" },
];
