import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { SignUpForm } from "./signup-form";

export default async function SignUpPage() {
  const t = await getTranslations("auth.signUp");
  return (
    <AuthScreen>
      <div className="mb-8 flex flex-col items-center text-center">
        <BrandedAppLogo size={56} className="mb-4" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <SignUpForm />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("alreadyHaveAccount")}{" "}
        <a href="/signin" className="font-medium text-primary hover:underline">
          {t("signInLink")}
        </a>
      </p>
    </AuthScreen>
  );
}
