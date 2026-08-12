import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { WikiTreeNode } from "@monark/wiki/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { WikiShell } from "./wiki-shell";

/**
 * Wiki section shell. Gates the whole `/wiki` subtree on the `wiki.enabled`
 * feature flag (404 when off, matching the hidden nav entry) + the `wiki.read`
 * permission, then mounts the persistent page-tree sidebar around the routed
 * page content (`{children}`). The tree is fetched here for first paint and
 * kept fresh client-side.
 */
export default async function WikiLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const api = createServerTrpcClient(sessionData.session.access_token);

  const flags = await api.featureFlags.getAllForSession
    .query()
    .catch(() => ({}) as Record<string, boolean>);
  if (flags["wiki.enabled"] !== true) notFound();

  const [initialTree, myPermissions] = await Promise.all([
    api.wiki.pages.tree.query().catch(() => [] as WikiTreeNode[]),
    api.rbac.myPermissions.query().catch(() => [] as string[]),
  ]);
  const perms = myPermissions as string[];
  const canRead = perms.includes("wiki.read");
  if (!canRead) notFound();

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden">
      <WikiShell
        initialTree={initialTree}
        canCreate={perms.includes("wiki.create")}
        canUpdate={perms.includes("wiki.update")}
        canDelete={perms.includes("wiki.delete")}
      >
        {children}
      </WikiShell>
    </div>
  );
}
