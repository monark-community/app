"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type BaseItem = {
  /** Stable key for the React list reconciliation. */
  key: string;
  /** Visible label. Localised at the call site. */
  label: string;
  icon: LucideIcon;
  /** Highlights the item when truthy. */
  active?: boolean;
};

export type SidebarItem =
  | (BaseItem & { href: string; onClick?: never })
  | (BaseItem & { onClick: () => void; href?: never });

type SidebarProps = {
  items: SidebarItem[];
  /** `<nav aria-label>` ; recommended whenever there's more than one nav landmark. */
  ariaLabel?: string;
  /**
   * `vertical` (default) renders a stacked column ; intended for the
   * left rail on `xl+` viewports, slot inside `<SectionShell sidebar>`.
   *
   * `horizontal` renders a scrollable row that expands to the page edge
   * via negative margins ; intended for the mobile fallback when the
   * vertical rail is hidden.
   */
  orientation?: "vertical" | "horizontal";
  className?: string;
};

/**
 * The standard in-content sidebar. Mirrors the design of the primary-nav
 * popover (same item shape, hover states, icon size) so the two
 * navigation surfaces feel like the same component family ; the
 * difference is delivery (this one lives in layout flow, the popover
 * floats from the AppBar).
 *
 * Sized intrinsically by its parent slot — the `xl+` slot in
 * `<SectionShell sidebar>` is `18rem`, matching the popover's `w-72`. On
 * mobile (horizontal orientation) the bar takes 100% of its row and
 * scrolls.
 *
 * Items can be either Next `<Link>`s (declare `href`) or plain
 * `<button>`s (declare `onClick`). Mixed lists are allowed ; the
 * component picks the right element per-item.
 */
export function Sidebar({ items, ariaLabel, orientation = "vertical", className }: SidebarProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex gap-1",
        orientation === "vertical"
          ? "flex-col"
          : "-mx-4 flex-row overflow-x-auto px-4 sm:-mx-6 sm:px-6",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const itemClass = cn(
          "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          orientation === "horizontal" && "shrink-0 whitespace-nowrap",
          item.active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        );
        const inner = (
          <>
            <Icon className="h-4 w-4" aria-hidden />
            <span>{item.label}</span>
          </>
        );
        if ("href" in item && item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={itemClass}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            aria-current={item.active ? "page" : undefined}
            className={itemClass}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
