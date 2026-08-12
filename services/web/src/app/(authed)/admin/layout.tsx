import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SectionShell } from "@/components/section-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { AdminSidebar } from "./admin-sidebar";

// Nested under `app/(authed)/admin/`, so the parent (authed) layout has
// already guaranteed a session before this runs. Two additional gates:
//  1. Non-admins are bounced to / so staff surfaces never render-then-
//     flash for the wrong audience.
//  2. Admins missing TOTP are bounced to /account?totpRequired=1 where
//     the enforcement banner explains the soft/hard wall.
//
// After the gates we mount the shared admin shell : the AppBar (from the
// parent layout) + SectionShell with the AdminSidebar, so every `/admin/*`
// sub-route inherits the same chrome without each page re-implementing it.
// Pages just export their content.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  // The parent (authed) layout already redirects to /signin when the
  // session is missing, but Next renders nested async layouts
  // concurrently — so if we dereference `.access_token` eagerly we
  // race the parent's redirect and crash. Bail out cleanly when no
  // session is present and let the parent's redirect win.
  if (!sessionData.session) return null;
  const accessToken = sessionData.session.access_token;

  const api = createServerTrpcClient(accessToken);

  const isAdmin = await api.rbac.isAdmin.query().catch(() => false);
  if (!isAdmin) redirect("/");

  const enforcement = await api.auth.totp.adminEnforcement
    .query()
    .catch(() => ({ required: false as const }));
  if (enforcement.required) {
    redirect("/account/security?totpRequired=1");
  }

  return (
    <SectionShell
      sidebar={<AdminSidebar />}
      secondaryNav={<AdminSidebar orientation="horizontal" />}
    >
      {children}
    </SectionShell>
  );
}
