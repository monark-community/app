import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { readTotpPending } from "@/lib/totp-pending-cookie";
import { TotpForm } from "./totp-form";

// If no challenge is pending, the user landed here by accident (or the cookie
// expired); bounce them back to /signin rather than showing a blank form.
export default async function TotpChallengePage() {
  const pending = await readTotpPending();
  if (!pending.pending) {
    redirect("/signin");
  }
  const t = await getTranslations("auth.totpChallenge");
  return (
    <AuthScreen
      brand={<BrandedAppLogo size={36} />}
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <form
          action={async () => {
            "use server";
            const { signOutAction } = await import("../actions");
            await signOutAction("local");
          }}
        >
          <button
            type="submit"
            className="mt-6 w-full cursor-pointer text-center text-sm text-muted-foreground hover:underline"
          >
            {t("cancel")}
          </button>
        </form>
      }
    >
      <TotpForm />
    </AuthScreen>
  );
}
