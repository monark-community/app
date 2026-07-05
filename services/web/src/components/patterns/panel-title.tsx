import type { ReactNode } from "react";

/**
 * Small heading pinned to the top of a standalone tools popover so an opened
 * menu names itself — shared by the table's Filter / Sort / Columns menus so
 * they read identically. The collapsed drill-in views use their own
 * `SubmenuHeader` (which adds a back arrow) instead.
 */
export function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-1.5 pb-1.5 pt-0.5 text-xs font-semibold text-foreground">{children}</div>
  );
}
