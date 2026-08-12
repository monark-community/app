import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The section's secondary-nav rail : a `w-72` vertical column docked to
 * the viewport edge under the AppBar (`top-14`), on `xl+` only. The left
 * variant sits just right of the persistent primary {@link NavRail}
 * (`left-14`) ; the right variant mirrors on the opposite edge (a future
 * contextual rail). Rendered by {@link "@/components/section-shell" |
 * SectionShell}'s `sidebar` slot, shared by every section (centered or
 * full-width content) so the rail geometry lives in one place. Below `xl`
 * it's hidden and the shell renders its horizontal secondary-nav strip
 * instead. The `Sidebar` dropped in as `children` carries its own
 * labelled `<nav>` landmark.
 */
export function SidebarRail({
  children,
  side = "left",
  className,
}: {
  children: ReactNode;
  side?: "left" | "right";
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "fixed top-14 z-20 hidden h-[calc(100dvh-3.5rem)] w-72 overflow-y-auto bg-background p-4 xl:block",
        // `left-14` clears the primary NavRail (`w-14`), present at every
        // width this rail shows (`xl` > `md`) ; the right variant docks flush.
        side === "left" ? "left-14 border-r border-border" : "right-0 border-l border-border",
        className,
      )}
    >
      {children}
    </aside>
  );
}
