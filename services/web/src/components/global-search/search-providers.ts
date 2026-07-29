import type { ComponentType } from "react";
import { AutomationSearchProvider } from "@/app/(authed)/automation/automation-search-provider";
import { CalendarSearchProvider } from "@/app/(authed)/calendar/calendar-search-provider";
import { KanbanSearchProvider } from "@/app/(authed)/kanban/kanban-search-provider";
import { DataSearchProvider } from "@/app/(authed)/data/data-search-provider";
import type { SearchProviderProps } from "./search-contract";

/**
 * A contextual content contributor to the global command palette. Each provider
 * renders its own result group (via `SearchResultsGroup`) for one section's
 * entities, and declares when it's active by the current path. Providers own
 * their own tRPC hooks, so the dialog stays agnostic of what each searches.
 *
 * Mirrors the drawer's `PRIMARY_NAV` config : a module opts into content search
 * by exporting a provider component and adding one entry here — the single
 * place that composes the palette's contextual results, so it can't silently
 * miss a module the way a scattered `if (inX)` branch did.
 */
export type SearchProvider = {
  /** Stable id — React key + the `globalSearch.groups.<id>` heading key. */
  id: string;
  /** Whether this provider contributes results on the given path. */
  isActive: (pathname: string) => boolean;
  /** Renders the provider's result group (or nothing while it has none). */
  Results: ComponentType<SearchProviderProps>;
};

export const SEARCH_PROVIDERS: SearchProvider[] = [
  { id: "calendar", isActive: (p) => p.startsWith("/calendar"), Results: CalendarSearchProvider },
  { id: "kanban", isActive: (p) => p.startsWith("/kanban"), Results: KanbanSearchProvider },
  { id: "data", isActive: (p) => p.startsWith("/data"), Results: DataSearchProvider },
  {
    id: "automation",
    isActive: (p) => p.startsWith("/automation"),
    Results: AutomationSearchProvider,
  },
];
