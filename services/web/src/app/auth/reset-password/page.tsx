import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

// Lives outside (authed) on purpose. The recovery-token session that
// gets us here has a real Supabase session but no trusted-device cookie ;
// the (authed) gate would bounce it through /auth/sign-out-stale before
// the user could finish setting a new password.
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  // `getUser` round-trips to the Auth server so a tampered cookie can't
  // spoof a recovery-flow session. Same pattern as (authed)/layout.
  const { data, error } = await supabase.auth.getUser();
  const t = await getTranslations("auth.resetPassword");

  if (error || !data.user) {
    return (
      <AuthScreen
        brand={<BrandedAppLogo size={36} />}
        title={t("expiredTitle")}
        subtitle={t("expiredSubtitle")}
      >
        <Button asChild variant="outline" className="w-full">
          <Link href="/forgot-password">{t("requestAgain")}</Link>
        </Button>
      </AuthScreen>
    );
  }

  // Page is only reachable mid-recovery ; if a fully-confirmed user
  // somehow lands here (e.g. browser back-button) bounce them home so
  // they don't re-trigger the password update unintentionally.
  if (!data.user.email) redirect("/account");

  return (
    <AuthScreen
      brand={<BrandedAppLogo size={36} />}
      title={t("title")}
      subtitle={t("subtitle", { email: data.user.email })}
    >
      <ResetPasswordForm email={data.user.email} />
    </AuthScreen>
  );
}
