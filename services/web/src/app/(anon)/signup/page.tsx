import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { SignUpForm } from "./signup-form";

export default async function SignUpPage() {
  const t = await getTranslations("auth.signUp");
  return (
    <AuthScreen
      brand={<BrandedAppLogo size={36} />}
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <a href="/signin" className="font-medium text-primary hover:underline">
            {t("signInLink")}
          </a>
        </p>
      }
    >
      <SignUpForm />
    </AuthScreen>
  );
}
