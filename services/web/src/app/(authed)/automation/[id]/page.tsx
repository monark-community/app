import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { AutomationEditor } from "./automation-editor";

export default async function AutomationEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("automation");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const api = createServerTrpcClient(data.session.access_token);
  const perms = (await api.rbac.myPermissions.query().catch(() => [] as string[])) as string[];
  const canManage = perms.includes("automation.manage");
  const canEdit = perms.includes("automation.create") || canManage;
  const canRun = perms.includes("automation.run") || canManage;

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={t("title")}>
        <AutomationEditor
          automationId={id}
          canEdit={canEdit}
          canRun={canRun}
          canManage={canManage}
        />
      </main>
    </div>
  );
}
