import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgotPassword");
  return (
    <AuthScreen
      brand={<BrandedAppLogo size={36} />}
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("backToSignIn")}{" "}
          <Link href="/signin" className="font-medium text-primary hover:underline">
            {t("signInLink")}
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthScreen>
  );
}
