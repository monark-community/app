import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { BrandedAppLogo } from "@/components/branded-app-logo"
import { readTotpPending } from "@/lib/totp-pending-cookie"
import { TotpForm } from "./totp-form"

// If no challenge is pending, the user landed here by accident (or the cookie
// expired); bounce them back to /signin rather than showing a blank form.
export default async function TotpChallengePage() {
  const pending = await readTotpPending()
  if (!pending.pending) {
    redirect("/signin")
  }
  const t = await getTranslations("auth.totpChallenge")
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandedAppLogo size={56} className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <TotpForm />
        <form
          action={async () => {
            "use server"
            const { signOutAction } = await import("../actions")
            await signOutAction("local")
          }}
        >
          <button
            type="submit"
            className="mt-6 w-full cursor-pointer text-center text-sm text-muted-foreground hover:underline"
          >
            {t("cancel")}
          </button>
        </form>
      </div>
    </main>
  )
}
