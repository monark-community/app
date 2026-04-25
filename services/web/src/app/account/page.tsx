import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { MonarkLogo } from "@/components/monark-logo"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { signOutAction } from "../signin/actions"
import { AccountShell } from "./account-shell"

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect("/signin")

  const t = await getTranslations("account")

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

      <AccountShell />
    </main>
  )
}
