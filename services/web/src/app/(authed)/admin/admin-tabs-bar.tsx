"use client";

import { SecondaryTabsBar } from "@/components/secondary-tabs-bar";
import { AdminSidebar } from "./admin-sidebar";

/**
 * Admin section's mobile / narrow-viewport secondary nav : the shared
 * {@link SecondaryTabsBar} wrapping the horizontal AdminSidebar. Hidden
 * on `xl+`, where the vertical rail takes over.
 */
export function AdminTabsBar() {
  return (
    <SecondaryTabsBar>
      <AdminSidebar orientation="horizontal" />
    </SecondaryTabsBar>
  );
}
