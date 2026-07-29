"use client";

import { SecondaryTabsBar } from "@/components/secondary-tabs-bar";
import { DataSidebar } from "./data-sidebar";
import type { DataTab } from "./data-tabs";

/**
 * Data section's mobile / narrow-viewport secondary nav : the shared
 * {@link SecondaryTabsBar} wrapping the horizontal DataSidebar. Hidden on
 * `xl+`, where the vertical rail takes over.
 */
export function DataTabsBar({
  tabs,
  allowedIds,
}: {
  tabs: readonly DataTab[];
  allowedIds: readonly string[];
}) {
  return (
    <SecondaryTabsBar>
      <DataSidebar orientation="horizontal" tabs={tabs} allowedIds={allowedIds} />
    </SecondaryTabsBar>
  );
}
