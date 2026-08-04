import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { ServiceAccountsManager } from "./service-accounts-manager";

/**
 * Admin → Service accounts. Org-owned machine principals whose API keys act as
 * the account, not a person. 404s unless `public-api.service-accounts` is on
 * (v2 ships dark) ; the sidebar tab is hidden by the same flag.
 */
export default async function AdminServiceAccountsPage() {
  const t = await getTranslations("admin.serviceAccounts");

  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const api = createServerTrpcClient(sessionData.session.access_token);
  const flags = await api.featureFlags.getAllForSession
    .query()
    .catch(() => ({}) as Record<string, boolean>);
  if (flags["public-api.service-accounts"] !== true) notFound();

  return (
    <section className="space-y-4 xl:flex xl:h-full xl:flex-col">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <ServiceAccountsManager />
    </section>
  );
}
