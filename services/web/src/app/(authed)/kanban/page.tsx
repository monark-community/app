import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { BoardDef } from "@monark/kanban/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { KanbanShell } from "./kanban-shell";

export default async function KanbanPage() {
  const t = await getTranslations("kanban");

  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const api = createServerTrpcClient(sessionData.session.access_token);

  // Feature-flag kill switch : the route 404s when `kanban.board` is off for
  // the session (matches the hidden nav entry). This is the real boundary.
  const flags = await api.featureFlags.getAllForSession
    .query()
    .catch(() => ({}) as Record<string, boolean>);
  if (flags["kanban.board"] === false) notFound();
  const queryEnabled = flags["kanban.query"] === true;

  const [rawBoards, myPermissions] = await Promise.all([
    api.kanban.boards.list.query().catch(() => []),
    api.rbac.myPermissions.query().catch(() => [] as string[]),
  ]);

  const initialBoards: BoardDef[] = rawBoards.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description ?? undefined,
    color: b.color ?? undefined,
  }));

  const perms = myPermissions as string[];
  const canManage = perms.includes("kanban.manage");
  const canCreate = perms.includes("kanban.create") || canManage;
  const canEdit = perms.includes("kanban.edit") || canManage;
  const canDelete = perms.includes("kanban.delete") || canManage;

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={t("title")}>
        <KanbanShell
          initialBoards={initialBoards}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          canManage={canManage}
          queryEnabled={queryEnabled}
        />
      </main>
    </div>
  );
}
