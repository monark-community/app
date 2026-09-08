import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { OAuthButtons } from "../oauth-buttons";
import { SignInForm } from "./signin-form";
import { SignInStatusBanner } from "./signin-status-banner";

export default async function SignInPage() {
  const t = await getTranslations("auth.signIn");
  // Anon-safe query ; returns [] when social sign-in isn't configured
  // for this deployment or the `auth.oauth` flag is off, and the
  // buttons then render nothing at all.
  const providers = await createServerTrpcClient()
    .auth.oauth.providers.query()
    .catch(() => []);
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
      <OAuthButtons providers={providers} />
      <SignInForm />
    </AuthScreen>
  );
}
