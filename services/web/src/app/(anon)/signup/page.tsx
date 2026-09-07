import { getTranslations } from "next-intl/server";
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
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandedAppLogo size={56} className="mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <OAuthButtons providers={providers} />
        <SignUpForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <a href="/signin" className="font-medium text-primary hover:underline">
            {t("signInLink")}
          </a>
        </p>
      </div>
    </main>
  );
}
