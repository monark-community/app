import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"

// Two gates run on every /admin/** request:
//  1. Non-admins (and anon users) are bounced to /account so staff
//     surfaces never render-then-flash for the wrong audience.
//  2. Admins missing TOTP are bounced to /account?totpRequired=1 where
//     the enforcement banner explains the soft/hard wall.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) redirect("/signin")

  const api = createServerTrpcClient(accessToken)

  const isAdmin = await api.rbac.isAdmin.query().catch(() => false)
  if (!isAdmin) redirect("/account")

  const enforcement = await api.auth.totp.adminEnforcement
    .query()
    .catch(() => ({ required: false as const }))
  if (enforcement.required) {
    redirect("/account?totpRequired=1&tab=security")
  }

  return <>{children}</>
}
