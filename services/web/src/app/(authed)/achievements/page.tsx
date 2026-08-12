import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { AchievementsGallery } from "./achievements-gallery";

export default async function AchievementsPage() {
  const t = await getTranslations("achievements");

  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const api = createServerTrpcClient(sessionData.session.access_token);
  const flags = await api.featureFlags.getAllForSession
    .query()
    .catch(() => ({}) as Record<string, boolean>);
  if (flags["achievements.enabled"] !== true) notFound();

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <AchievementsGallery />
    </section>
  );
}
