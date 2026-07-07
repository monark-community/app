import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";

// `/data` is the section entry point. The section is driven entirely by the
// Data Models engine (no static tabs), so forward to the first model the user
// can browse — landing them on something actionable instead of a blank shell.
// When there are none (or no read access), show a small empty state.
export default async function DataHomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const api = createServerTrpcClient(sessionData.session.access_token);
  const perms = await api.rbac.myPermissions.query().catch(() => [] as string[]);
  const permSet = new Set(perms as string[]);
  const canBrowseRecords =
    permSet.has("data-models.record-read") && permSet.has("data-models.read-schema");

  const models = canBrowseRecords
    ? await api.dataModels.models.list.query({ limit: 1 }).catch(() => ({ items: [] }))
    : { items: [] };

  const first = models.items[0];
  if (first) redirect(`/data/models/${first.key}`);

  const t = await getTranslations("data");
  return (
    <div className="mx-auto max-w-md py-16 text-center text-sm text-muted-foreground">
      {t("empty")}
    </div>
  );
}
