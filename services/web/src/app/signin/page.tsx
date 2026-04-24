import { getTranslations } from "next-intl/server"
import { MonarkLogo } from "@/components/monark-logo"
import { SignInForm } from "./signin-form"

export default async function SignInPage() {
  const t = await getTranslations("auth.signIn")
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <MonarkLogo size={56} className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <SignInForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <a href="/signup" className="font-medium text-primary hover:underline">
            {t("signUpLink")}
          </a>
        </p>
      </div>
    </main>
  )
}
