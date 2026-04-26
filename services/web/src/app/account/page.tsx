import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { MonarkLogo } from "@/components/monark-logo"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { DEVICE_COOKIE_NAME } from "@/lib/trusted-device-cookie"
import { signOutAction } from "../signin/actions"
import { AccountShell } from "./account-shell"
import { AdminTotpBanner } from "./admin-totp-banner"

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) redirect("/signin")

  const t = await getTranslations("account")

  // Resolve "current device id" server-side so the cookie value never has
  // to round-trip back to client memory; the section receives just an id
  // string to compare against the rows it already fetches via React Query.
  const cookieStore = await cookies()
  const deviceCookieValue = cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null
  const api = createServerTrpcClient(session.access_token)
  const currentDeviceId = deviceCookieValue
    ? await api.auth.trustedDevices.currentDeviceId
        .query({ cookieValue: deviceCookieValue })
        .catch(() => null)
    : null

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MonarkLogo size={32} />
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <form
          action={async () => {
            "use server"
            await signOutAction("local")
          }}
        >
          <button
            type="submit"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {t("signOut")}
          </button>
        </form>
      </header>

      <AdminTotpBanner />
      <AccountShell currentDeviceId={currentDeviceId} />
    </main>
  )
}
