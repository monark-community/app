import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { AutomationsList } from "./automations-list";

export default async function AutomationPage() {
  const t = await getTranslations("automation");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const api = createServerTrpcClient(data.session.access_token);
  const perms = (await api.rbac.myPermissions.query().catch(() => [] as string[])) as string[];
  const canManage = perms.includes("automation.manage");
  const canCreate = perms.includes("automation.create") || canManage;

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden">
      <main className="min-h-0 flex-1 overflow-y-auto" aria-label={t("title")}>
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <AutomationsList canCreate={canCreate} canManage={canManage} />
        </div>
      </main>
    </div>
  );
}
