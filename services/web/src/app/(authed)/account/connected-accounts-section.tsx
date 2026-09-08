"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { OAUTH_PROVIDER_LABELS, type OAuthProvider } from "@monark/auth/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/patterns";
import { PageSection } from "@/components/page-section";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { trpc } from "@/lib/trpc";
import {
  beginProviderLinkAction,
  unlinkProviderAction,
  type UnlinkProviderResult,
} from "./actions";

/**
 * How this account can be signed into, and the controls to change it.
 *
 * Connect runs in two steps : a server action arms a single-use
 * HTTP-only intent cookie, then the browser calls
 * `supabase.auth.linkIdentity` (PKCE has to start client-side so the
 * verifier lands where /auth/callback can read it). The cookie is what
 * tells the callback this is a link rather than a sign-in, so it can
 * skip the TOTP challenge the existing session already cleared without
 * that being something a URL parameter could ask for.
 *
 * Disconnect is guarded server-side against removing the last usable
 * method, and gated behind a TOTP code when the user is enrolled — the
 * same treatment as changing a password or an email address, because
 * removing a way in is at least as sensitive as changing one.
 */
export function ConnectedAccountsSection() {
  const t = useTranslations("account.connectedAccounts");
  const params = useSearchParams();
  const utils = trpc.useUtils();
  const identities = trpc.auth.oauth.identities.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  // Which providers this deployment offers at all ; a provider that
  // isn't configured shouldn't get a "Connect" button.
  const available = trpc.auth.oauth.providers.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const [pendingLink, setPendingLink] = useState<OAuthProvider | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<OAuthProvider | null>(null);
  const [totpFor, setTotpFor] = useState<OAuthProvider | null>(null);
  const [totpError, setTotpError] = useState<"invalidTotpCode" | "totpRequired" | null>(null);
  const [isUnlinking, startUnlink] = useTransition();

  // `/auth/callback` redirects back here with `?linked=<provider>` after
  // a successful connect, so the confirmation lands on the page the user
  // started from rather than being lost in the redirect chain.
  const linked = params.get("linked");
  useEffect(() => {
    if (!linked) return;
    const label = OAUTH_PROVIDER_LABELS[linked as OAuthProvider] ?? linked;
    toast.success(t("linkedToast", { provider: label }));
    void utils.auth.oauth.identities.invalidate();
    // Strip the param so a refresh doesn't re-toast.
    window.history.replaceState(null, "", window.location.pathname);
  }, [linked, t, utils]);

  const connected = identities.data?.providers ?? [];
  const hasPassword = identities.data?.hasPassword ?? false;
  const connectable = (available.data ?? []).filter((p) => !connected.includes(p));

  async function startLink(provider: OAuthProvider) {
    setPendingLink(provider);
    const armed = await beginProviderLinkAction({ provider });
    if (!armed.ok) {
      setPendingLink(null);
      toast.error(t(`errors.${armed.errorCode}`));
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      // On success the browser has already navigated to the provider.
      setPendingLink(null);
      // The most likely cause is that the provider account is already
      // attached to a different Monark user ; Supabase reports that as a
      // generic identity error, so the message stays non-committal.
      toast.error(t("errors.linkFailed", { provider: OAUTH_PROVIDER_LABELS[provider] }));
    }
  }

  function commitUnlink(provider: OAuthProvider, totpCode?: string) {
    startUnlink(async () => {
      const result: UnlinkProviderResult = await unlinkProviderAction({ provider, totpCode });
      if (result.ok) {
        toast.success(t("unlinkedToast", { provider: OAUTH_PROVIDER_LABELS[provider] }));
        setTotpFor(null);
        setTotpError(null);
        await utils.auth.oauth.identities.invalidate();
        return;
      }
      if (result.errorCode === "invalidTotpCode" || result.errorCode === "totpRequired") {
        setTotpError(result.errorCode);
        return;
      }
      toast.error(t(`errors.${result.errorCode}`));
      setTotpFor(null);
      setTotpError(null);
    });
  }

  // Enrolled users get the code prompt between confirming and acting ;
  // the server is the authority either way.
  const totpStatus = trpc.auth.totp.status.useQuery(undefined, { refetchOnWindowFocus: false });
  const totpEnrolled = Boolean(
    totpStatus.data && "enrolled" in totpStatus.data && totpStatus.data.enrolled,
  );

  function onConfirmUnlink(provider: OAuthProvider) {
    setConfirmUnlink(null);
    if (totpEnrolled) {
      setTotpError(null);
      setTotpFor(provider);
      return;
    }
    commitUnlink(provider);
  }

  // Removing the only remaining method would lock the account ; the
  // server refuses it too, but disabling the button explains it better.
  function canUnlink(provider: OAuthProvider): boolean {
    if (hasPassword) return true;
    return connected.filter((p) => p !== provider).length > 0;
  }

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      {identities.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <ul className="space-y-2">
          {connected.map((provider) => (
            <li
              key={provider}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">{OAUTH_PROVIDER_LABELS[provider]}</p>
                <p className="text-xs text-muted-foreground">{t("connected")}</p>
              </div>
              <div className="ml-auto">
                {canUnlink(provider) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    disabled={isUnlinking}
                    onClick={() => setConfirmUnlink(provider)}
                  >
                    <Unlink className="h-4 w-4" aria-hidden />
                    {t("disconnect")}
                  </Button>
                ) : (
                  <p className="max-w-[16rem] text-right text-xs text-muted-foreground">
                    {t("lastMethodHint")}
                  </p>
                )}
              </div>
            </li>
          ))}

          {connectable.map((provider) => (
            <li
              key={provider}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3"
            >
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">{OAUTH_PROVIDER_LABELS[provider]}</p>
                <p className="text-xs text-muted-foreground">{t("notConnected")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={pendingLink !== null}
                onClick={() => void startLink(provider)}
              >
                {pendingLink === provider ? t("connecting") : t("connect")}
              </Button>
            </li>
          ))}

          <li className="flex items-center gap-3 rounded-lg border border-border p-3">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("password")}</p>
              <p className="text-xs text-muted-foreground">
                {hasPassword ? t("connected") : t("notSet")}
              </p>
            </div>
          </li>
        </ul>
      )}

      <ConfirmDialog
        open={confirmUnlink !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmUnlink(null);
        }}
        title={t("confirmTitle")}
        description={
          confirmUnlink ? t("confirmBody", { provider: OAUTH_PROVIDER_LABELS[confirmUnlink] }) : ""
        }
        confirmLabel={t("disconnect")}
        cancelLabel={t("cancel")}
        isPending={isUnlinking}
        onConfirm={() => {
          if (confirmUnlink) onConfirmUnlink(confirmUnlink);
        }}
      />

      <TotpConfirmDialog
        open={totpFor !== null}
        onOpenChange={(next) => {
          if (!next) {
            setTotpFor(null);
            setTotpError(null);
          }
        }}
        onConfirm={async (code) => {
          setTotpError(null);
          if (totpFor) commitUnlink(totpFor, code);
        }}
        scope="providerUnlink"
        errorKey={totpError}
        pending={isUnlinking}
      />
    </PageSection>
  );
}
