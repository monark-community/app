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

  // Standalone section page (no `layout.tsx` of its own), so it owns the
  // bounded-height + internal-scroll chrome itself — same shape as
  // `/automation`. `<body>` is globally `overflow-y-hidden`, so without the
  // `100dvh - 57px` box (the AppBar's 56px row + 1px hairline) a long catalog
  // would simply be unreachable, and without the padded container the gallery
  // would sit flush against the rail and the bar.
  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden">
      <main className="min-h-0 flex-1 overflow-y-auto" aria-label={t("title")}>
        <section className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </header>
          <AchievementsGallery />
        </section>
      </main>
    </div>
  );
}
