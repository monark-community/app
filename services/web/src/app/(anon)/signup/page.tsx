import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { OAuthButtons } from "../oauth-buttons";
import { SignUpForm } from "./signup-form";

export default async function SignUpPage() {
  const t = await getTranslations("auth.signUp");
  // Same component as /signin : registering through a provider and
  // signing in through one are the same round trip, and the callback
  // provisions the account when it turns out to be new.
  const providers = await createServerTrpcClient()
    .auth.oauth.providers.query()
    .catch(() => []);
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
      <OAuthButtons providers={providers} />
      <SignUpForm />
    </AuthScreen>
  );
}
