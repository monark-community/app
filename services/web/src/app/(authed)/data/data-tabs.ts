// Icons are referenced by name, not by component, because the tabs built in
// `layout.tsx` (a Server Component) end up passed as a prop into client
// components (`DataSidebar` / `DataTabsBar`). A Lucide icon is a function
// component ; functions can't cross the Server->Client serialization boundary
// ("Functions cannot be passed directly to Client Components"), so the icon has
// to travel as a plain string and get resolved back to a component client-side
// (see `data-sidebar.tsx`'s `TAB_ICONS` map).
export type DataTabIcon = "database";

export type DataTab = {
  id: string;
  href: string;
  icon: DataTabIcon;
  /**
   * Dotted permission that gates this model's route. The sidebar lists
   * only the models the user can read ; the model's own route layout
   * still enforces the same check (this is a UX affordance, not the
   * security boundary).
   */
  permission: string;
  /**
   * Already-resolved display label. Data Models carry admin-authored names
   * (not i18n keys), so their tabs set this directly.
   */
  label?: string;
};

/**
 * The Data section is driven entirely by the polymorphic Data Models engine :
 * every tab is built server-side in `data/layout.tsx` from
 * `dataModels.models.list` (per-org, DB-backed), so there are no static tabs.
 * Kept as an (empty) named export so the layout / index page have a single,
 * obvious extension point if a bespoke non-model surface is ever added back.
 */
export const DATA_TABS: ReadonlyArray<DataTab> = [];
