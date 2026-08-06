import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { TelegramSettings } from "./telegram-settings";

export default async function TelegramPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const api = createServerTrpcClient(data.session.access_token);
  const flags = await api.featureFlags.getAllForSession
    .query()
    .catch(() => ({}) as Record<string, boolean>);
  if (flags["telegram.enabled"] !== true) notFound();

  const perms = (await api.rbac.myPermissions.query().catch(() => [] as string[])) as string[];
  const canManage = perms.includes("telegram.manage");

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <TelegramSettings canManage={canManage} />
        </div>
      </main>
    </div>
  );
}
