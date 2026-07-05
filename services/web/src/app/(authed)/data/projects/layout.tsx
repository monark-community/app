import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";

// Permission gate only — the AppBar + secondary nav come from the
// parent Data layout. Bounces users without `projects.read` to `/`.
export default async function ProjectsLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const api = createServerTrpcClient(sessionData.session.access_token);
  const perms = await api.rbac.myPermissions.query().catch(() => [] as string[]);
  if (!(perms as string[]).includes("projects.read")) redirect("/");
  return <>{children}</>;
}
