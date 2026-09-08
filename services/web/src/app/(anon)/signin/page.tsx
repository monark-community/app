import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { SignInForm } from "./signin-form";
import { SignInStatusBanner } from "./signin-status-banner";

export default async function SignInPage() {
  const t = await getTranslations("auth.signIn");
  return (
    <AuthScreen
      brand={<BrandedAppLogo size={36} />}
      title={t("title")}
      subtitle={t("subtitle")}
      above={<SignInStatusBanner />}
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <a href="/signup" className="font-medium text-primary hover:underline">
            {t("signUpLink")}
          </a>
        </p>
      }
    >
      <SignInForm />
    </AuthScreen>
  );
}
