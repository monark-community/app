import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppBar } from "@/components/app-bar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";

export default async function ProjectsLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const api = createServerTrpcClient(sessionData.session.access_token);
  const perms = await api.rbac.myPermissions.query().catch(() => [] as string[]);
  if (!(perms as string[]).includes("projects.read")) redirect("/");
  return (
    <>
      <AppBar />
      <main className="w-full px-4 pb-20 pt-8 sm:px-6">{children}</main>
    </>
  );
}
