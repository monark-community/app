import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { FilesManager } from "./files-manager";

export default async function AdminFilesPage() {
  const t = await getTranslations("admin.files");

  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  // Feature-flag kill switch : the page 404s when `files.enabled` is off.
  const api = createServerTrpcClient(sessionData.session.access_token);
  const flags = await api.featureFlags.getAllForSession
    .query()
    .catch(() => ({}) as Record<string, boolean>);
  if (flags["files.enabled"] === false) notFound();

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <FilesManager />
    </section>
  );
}
