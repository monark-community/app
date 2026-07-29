import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { SidebarRail } from "@/components/sidebar-rail";
import { DATA_TABS, type DataTab } from "./data-tabs";
import { DataSidebar } from "./data-sidebar";
import { DataTabsBar } from "./data-tabs-bar";

/**
 * Shared shell for the Data section (`/data/*`). The AppBar comes from
 * the parent `(authed)/layout` ; this mounts the secondary nav — the
 * shared `SidebarRail` on `xl+`, the horizontal `DataTabsBar` below it —
 * so every data model inherits the same chrome. Content is full-width
 * (offset past the rail on `xl+`) because the data models render wide
 * tables, unlike the max-w-2xl PageLayout the admin forms use.
 *
 * Session is gated here ; per-model `<model>.read` permission checks
 * stay in each model's own route layout so a user with access to one
 * model but not another still gets bounced from the one they lack.
 *
 * The tab list is one entry per dynamically-registered Data Model this org
 * (or the platform) has defined — fetched here, since it's per-org and
 * DB-backed. Every model shares the same two permissions
 * (`data-models.record-read` to see it, `data-models.read-schema` to
 * resolve its fields — see `data/models/[modelKey]/layout.tsx`) ; the
 * model-list query itself, scoped to the caller's org, is what the
 * "allowed" filter really keys on. (`DATA_TABS` stays an empty extension
 * point for any future bespoke non-model surface.)
 */
export default async function DataLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const api = createServerTrpcClient(sessionData.session.access_token);
  const perms = await api.rbac.myPermissions.query().catch(() => [] as string[]);
  const permSet = new Set(perms as string[]);

  const canBrowseRecords =
    permSet.has("data-models.record-read") && permSet.has("data-models.read-schema");
  const registeredModels = canBrowseRecords
    ? await api.dataModels.models.list.query({ limit: 100 }).catch(() => ({ items: [] }))
    : { items: [] };

  const dynamicTabs: DataTab[] = registeredModels.items.map((model) => ({
    id: `model:${model.key}`,
    href: `/data/models/${model.key}`,
    icon: "database",
    permission: "data-models.record-read",
    label: model.name,
  }));

  const tabs: DataTab[] = [...DATA_TABS, ...dynamicTabs];
  const allowedIds = tabs.filter((tab) => permSet.has(tab.permission)).map((tab) => tab.id);

  // Desktop (`xl+`) : a viewport-height flex shell where `<main>` is the single
  // bounded scroll region — a list page fills it and its table scrolls
  // internally (no page scroll), a taller detail/form page scrolls `<main>`
  // itself. Below `xl` (phones / tablets, where the horizontal tab bar replaces
  // the rail) : plain block flow, so the page scrolls naturally and the tab
  // bar's hide-on-scroll + the mobile URL-bar collapse keep working. Nothing
  // measures the viewport in JS ; the behavior switch is pure CSS.
  return (
    <div className="xl:flex xl:h-[calc(100dvh-57px)] xl:flex-col xl:overflow-hidden">
      <DataTabsBar tabs={tabs} allowedIds={allowedIds} />
      <SidebarRail>
        <DataSidebar tabs={tabs} allowedIds={allowedIds} />
      </SidebarRail>
      <main className="w-full px-4 pb-6 pt-8 sm:px-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pl-78">
        {children}
      </main>
    </div>
  );
}
