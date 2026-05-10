import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { BrandedAppLogo } from "@/components/branded-app-logo"
import { Button } from "@/components/ui/button"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ResetPasswordForm } from "./reset-password-form"

// Lives outside (authed) on purpose. The recovery-token session that
// gets us here has a real Supabase session but no trusted-device cookie ;
// the (authed) gate would bounce it through /auth/sign-out-stale before
// the user could finish setting a new password.
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient()
  // `getUser` round-trips to the Auth server so a tampered cookie can't
  // spoof a recovery-flow session. Same pattern as (authed)/layout.
  const { data, error } = await supabase.auth.getUser()
  const t = await getTranslations("auth.resetPassword")

  if (error || !data.user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <BrandedAppLogo size={56} className="mb-4" />
            <h1 className="text-2xl font-semibold tracking-tight">{t("expiredTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("expiredSubtitle")}</p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/forgot-password">{t("requestAgain")}</Link>
          </Button>
        </div>
      </main>
    )
  }

  // Page is only reachable mid-recovery ; if a fully-confirmed user
  // somehow lands here (e.g. browser back-button) bounce them home so
  // they don't re-trigger the password update unintentionally.
  if (!data.user.email) redirect("/account")

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandedAppLogo size={56} className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle", { email: data.user.email })}
          </p>
        </div>
        <ResetPasswordForm email={data.user.email} />
      </div>
    </main>
  )
}
