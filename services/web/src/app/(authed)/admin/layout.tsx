import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { AppBar } from "@/components/app-bar"
import { PageLayout } from "@/components/page-layout"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { AdminSidebar } from "./admin-sidebar"

// Nested under `app/(authed)/admin/`, so the parent (authed) layout has
// already guaranteed a session before this runs. Two additional gates:
//  1. Non-admins are bounced to / so staff surfaces never render-then-
//     flash for the wrong audience.
//  2. Admins missing TOTP are bounced to /account?totpRequired=1 where
//     the enforcement banner explains the soft/hard wall.
//
// After the gates we mount the shared admin shell : AppBar + PageLayout
// with the AdminSidebar, so every `/admin/*` sub-route inherits the
// same chrome without each page re-implementing it. Pages just export
// their content.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session!.access_token

  const api = createServerTrpcClient(accessToken)

  const isAdmin = await api.rbac.isAdmin.query().catch(() => false)
  if (!isAdmin) redirect("/")

  const enforcement = await api.auth.totp.adminEnforcement
    .query()
    .catch(() => ({ required: false as const }))
  if (enforcement.required) {
    redirect("/account/security?totpRequired=1")
  }

  return (
    <>
      <AppBar />
      <main className="w-full px-4 py-8 sm:px-6">
        <PageLayout sidebar={<AdminSidebar />}>
          <div className="border-b border-border pb-3 xl:hidden">
            <AdminSidebar orientation="horizontal" />
          </div>
          {children}
        </PageLayout>
      </main>
    </>
  )
}
