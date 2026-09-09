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
        footer={
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("backToSignIn")}{" "}
            <Link href="/signin" className="font-medium text-primary hover:underline">
              {t("signInLink")}
            </Link>
          </p>
        }
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
      footer={
        // The recovery link drops the user straight here with a live
        // Supabase session, so this was a dead end : no app chrome to
        // navigate from, and no way to abandon the reset.
        //
        // Points at sign-out-stale rather than /signin because the
        // session is still live : `(anon)/layout` redirects any session
        // to `/`, which the (authed) gate would then bounce back to
        // sign-out-stale for want of a trusted-device cookie. Going
        // straight there drops the half-finished recovery session
        // deliberately instead of round-tripping two redirects.
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("backToSignIn")}{" "}
          <Link href="/auth/sign-out-stale" className="font-medium text-primary hover:underline">
            {t("signInLink")}
          </Link>
        </p>
      }
    >
      <ResetPasswordForm email={data.user.email} />
    </AuthScreen>
  );
}
