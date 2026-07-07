import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";

// Permission gate only — the AppBar + secondary nav come from the parent
// Data layout. Every dynamically-registered Data Model shares the same two
// permissions : `record-read` to see records, `read-schema` to resolve
// the model's fields (needed just to render a table's columns). Bounces
// users missing either to `/`.
export default async function DataModelRecordsLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const api = createServerTrpcClient(sessionData.session.access_token);
  const perms = await api.rbac.myPermissions.query().catch(() => [] as string[]);
  const permSet = new Set(perms as string[]);
  if (!permSet.has("data-models.record-read") || !permSet.has("data-models.read-schema")) {
    redirect("/");
  }
  return <>{children}</>;
}
