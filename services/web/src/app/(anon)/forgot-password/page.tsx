import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { BrandLogo } from "@/components/brand-logo"
import { ForgotPasswordForm } from "./forgot-password-form"

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgotPassword")
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size={56} className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <ForgotPasswordForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("backToSignIn")}{" "}
          <Link href="/signin" className="font-medium text-primary hover:underline">
            {t("signInLink")}
          </Link>
        </p>
      </div>
    </main>
  )
}
