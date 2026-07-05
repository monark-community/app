import type { ReactNode } from "react";
import { AppBar } from "@/components/app-bar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { DATA_TABS } from "./data-tabs";
import { DataSidebar } from "./data-sidebar";
import { DataTabsBar } from "./data-tabs-bar";

/**
 * Shared shell for the Data section (`/data/*`). Mounts the AppBar plus
 * the secondary nav — a vertical rail on `xl+`, the horizontal
 * DataTabsBar below it — so every data model inherits the same chrome.
 * Content is full-width (offset past the rail on `xl+`) because the data
 * models render wide tables, unlike the max-w-2xl PageLayout the admin
 * forms use.
 *
 * Session is gated here ; per-model `<model>.read` permission checks
 * stay in each model's own route layout so a user with access to one
 * model but not another still gets bounced from the one they lack.
 */
export default async function DataLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  // Filter the secondary nav to the models the user can actually read.
  // Each model's route layout re-checks the same permission, so this is
  // purely a UX affordance ; computed here (server) so no inaccessible
  // tab ever flashes before a client-side filter could hide it.
  const api = createServerTrpcClient(sessionData.session.access_token);
  const perms = await api.rbac.myPermissions.query().catch(() => [] as string[]);
  const permSet = new Set(perms as string[]);
  const allowedIds = DATA_TABS.filter((tab) => permSet.has(tab.permission)).map(
    (tab) => tab.id,
  );

  return (
    <>
      <AppBar />
      <DataTabsBar allowedIds={allowedIds} />
      <aside className="fixed left-0 top-14 z-20 hidden h-[calc(100vh-3.5rem)] w-72 overflow-y-auto border-r border-border bg-background p-4 xl:block">
        <DataSidebar allowedIds={allowedIds} />
      </aside>
      <main className="w-full px-4 pb-20 pt-8 sm:px-6 xl:pl-78">{children}</main>
    </>
  );
}
