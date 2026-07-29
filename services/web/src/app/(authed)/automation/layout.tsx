import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";

/**
 * Section gate for /automation. The `automation.enabled` feature flag is the
 * real kill switch (the nav entry is only hidden when off) ; `automation.view`
 * is the permission floor. Both the list and the editor sit under this.
 */
export default async function AutomationLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/");

  const api = createServerTrpcClient(data.session.access_token);
  const [flags, myPermissions] = await Promise.all([
    api.featureFlags.getAllForSession.query().catch(() => ({}) as Record<string, boolean>),
    api.rbac.myPermissions.query().catch(() => [] as string[]),
  ]);
  if (flags["automation.enabled"] === false) notFound();
  if (!(myPermissions as string[]).includes("automation.view")) notFound();

  return <>{children}</>;
}
