import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { AutomationIntegrations } from "./automation-integrations";

// Admin → Automation: the per-org connection config for every automation
// integration (GitHub / Telegram / X / Discord), regrouped here rather than as
// top-level nav entries. The parent admin layout has already gated `isAdmin` +
// TOTP; here we additionally 404 when the automation module is flagged off (the
// admin tab is hidden in that case, matching the other flag-gated tabs), and we
// resolve each integration's enabled + manage state to drive the tabs.
export default async function AdminAutomationPage() {
  const t = await getTranslations("admin.automation");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const api = createServerTrpcClient(data.session.access_token);
  const [flags, perms] = await Promise.all([
    api.featureFlags.getAllForSession.query().catch(() => ({}) as Record<string, boolean>),
    api.rbac.myPermissions.query().catch(() => [] as string[]),
  ]);
  if (flags["automation.enabled"] === false) notFound();

  const has = (key: string) => (perms as string[]).includes(key);
  const on = (key: string) => flags[key] === true;
  const integrations = {
    github: { enabled: on("github.enabled"), canManage: has("github.manage") },
    telegram: { enabled: on("telegram.enabled"), canManage: has("telegram.manage") },
    twitter: { enabled: on("twitter.enabled"), canManage: has("twitter.manage") },
    discord: { enabled: on("discord.enabled") },
  };

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <AutomationIntegrations integrations={integrations} />
    </section>
  );
}
