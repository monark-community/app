import { cookies } from "next/headers";
import { Separator } from "@/components/ui/separator";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServerTrpcClient } from "@/lib/trpc-server";
import { DEVICE_COOKIE_NAME } from "@/lib/trusted-device-cookie";
import { AccountPageHeader } from "../account-page-header";
import { ConnectedAccountsSection } from "../connected-accounts-section";
import { EmailSection } from "../email-section";
import { PasswordSection } from "../password-section";
import { TotpSection } from "../totp-section";
import { TrustedDevicesSection } from "../trusted-devices-section";

/**
 * Account → Security tab. Lives at `/account/security` so the URL
 * matches the sidebar item ; the parent layout owns the AppBar +
 * sidebar chrome.
 *
 * Resolves the current device id server-side (from the
 * device-trust cookie) so `<TrustedDevicesSection>` can mark which
 * row corresponds to "this browser" without round-tripping the
 * cookie value through client memory.
 */
export default async function AccountSecurityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: sessionData } = await supabase.auth.getSession();
  // The parent (authed) layout's session-gate redirect runs in
  // parallel with this page render ; bail out cleanly when no
  // session is present so we don't race the redirect with a
  // TypeError on `.access_token`. The redirect lands either way ;
  // returning null avoids the noisy server log line.
  if (!sessionData.session) return null;
  const session = sessionData.session;
  const cookieStore = await cookies();
  const deviceCookieValue = cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null;
  const api = createServerTrpcClient(session.access_token);
  const currentDeviceId = deviceCookieValue
    ? await api.auth.trustedDevices.currentDeviceId
        .query({ cookieValue: deviceCookieValue })
        .catch(() => null)
    : null;

  return (
    <div className="space-y-8">
      <AccountPageHeader tab="security" />
      <EmailSection />
      <Separator />
      <PasswordSection />
      <Separator />
      <ConnectedAccountsSection />
      <Separator />
      <TotpSection />
      <Separator />
      <TrustedDevicesSection currentDeviceId={currentDeviceId} />
    </div>
  );
}
