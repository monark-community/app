import { getTranslations } from "next-intl/server";
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogo } from "@/components/branded-app-logo";
import { RevokeDeviceForm } from "./revoke-device-form";

// Landing page for the one-click revoke link embedded in `auth.new-device`
// emails. The token in the URL carries userId + deviceId + a 7-day
// expiry signed by `EMAIL_ACTION_SECRET`, so the page works even when
// the user clicks from a device that isn't signed in.
//
// We deliberately do NOT fire the revoke server-side on page load —
// link-prefetchers (security tools, email-scanner bots, browser
// "preload-on-hover") would invoke the action without a human click.
// Instead this page renders a confirm button ; clicking it triggers
// the tRPC mutation client-side.

type Props = {
  params: Promise<{ token: string }>;
};

export default async function RevokeDevicePage({ params }: Props) {
  const { token } = await params;
  const t = await getTranslations("auth.revokeDevice");
  return (
    <AuthScreen brand={<BrandedAppLogo size={36} />} title={t("title")} subtitle={t("subtitle")}>
      <RevokeDeviceForm token={token} />
    </AuthScreen>
  );
}
