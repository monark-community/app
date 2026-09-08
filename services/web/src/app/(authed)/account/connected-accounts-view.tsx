"use client";

import { useTranslations } from "next-intl";
import { KeyRound, Link2, Unlink } from "lucide-react";
import { OAUTH_PROVIDER_LABELS, type OAuthProvider } from "@monark/auth/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSection } from "@/components/page-section";

/**
 * Falls back to the raw slug rather than rendering a nameless row. The
 * api and the web bundle deploy separately, so during a rolling deploy
 * the provider list can briefly contain a slug this bundle has no label
 * for ; "google" reads better than an empty line.
 */
function providerLabel(provider: OAuthProvider): string {
  return OAUTH_PROVIDER_LABELS[provider] ?? provider;
}

export type ConnectedAccountsViewProps = {
  loading?: boolean;
  /** Providers currently attached to the account. */
  connected: OAuthProvider[];
  /** Providers this deployment offers that aren't attached yet. */
  connectable: OAuthProvider[];
  hasPassword: boolean;
  /** Provider mid-redirect, so its button can show progress. */
  pendingProvider?: OAuthProvider | null;
  disconnecting?: boolean;
  onConnect: (provider: OAuthProvider) => void;
  onDisconnect: (provider: OAuthProvider) => void;
};

/**
 * The Connected accounts card, as pure presentation.
 *
 * Split out of the container for the same reason `NavRailView` and
 * `BrandedAppLogoView` are: with no tRPC and no server actions in its
 * import graph, the screenshot harness can mount it, which is how the
 * figure in [docs/technical-documentation/social-sign-in.md] is
 * generated. It also means the states that are awkward to reach in a
 * live app — a provider-only account, the undeletable last method — can
 * be reviewed without provisioning accounts to match.
 *
 * Every row answers "why would I?" rather than just stating a fact: the
 * section subtitle says what a second method buys you and that it's
 * optional, the undeletable row explains that it *is* the only way in
 * instead of pushing a password, and the password row says what a
 * password is for and links to the card that sets one.
 */
export function ConnectedAccountsView({
  loading = false,
  connected,
  connectable,
  hasPassword,
  pendingProvider = null,
  disconnecting = false,
  onConnect,
  onDisconnect,
}: ConnectedAccountsViewProps) {
  const t = useTranslations("account.connectedAccounts");

  // Removing the only remaining method would strand the account. The
  // server refuses it too ; withholding the button explains it better
  // than an error would.
  function canDisconnect(provider: OAuthProvider): boolean {
    if (hasPassword) return true;
    return connected.filter((p) => p !== provider).length > 0;
  }

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      {loading ? (
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
                <p className="text-sm font-medium">{providerLabel(provider)}</p>
                <p className="text-xs text-muted-foreground">{t("connected")}</p>
              </div>
              <div className="ml-auto">
                {canDisconnect(provider) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    disabled={disconnecting}
                    onClick={() => onDisconnect(provider)}
                  >
                    <Unlink className="h-4 w-4" aria-hidden />
                    {t("disconnect")}
                  </Button>
                ) : (
                  // Deliberately not "set a password first" : the user is
                  // trying to disconnect, not to add a credential. The
                  // useful answer is why the button isn't there.
                  <p className="text-xs text-muted-foreground">{t("onlyWayIn")}</p>
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
                <p className="text-sm font-medium">{providerLabel(provider)}</p>
                <p className="text-xs text-muted-foreground">{t("notConnected")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={pendingProvider !== null}
                onClick={() => onConnect(provider)}
              >
                {pendingProvider === provider ? t("connecting") : t("connect")}
              </Button>
            </li>
          ))}

          <li className="flex items-center gap-3 rounded-lg border border-border p-3">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("password")}</p>
              <p className="text-xs text-muted-foreground">
                {hasPassword ? t("connected") : t("passwordWhy")}
              </p>
            </div>
            {!hasPassword && (
              // Anchor to the password card further up this same page. A
              // bare "Not set" row left the user with a fact and nothing
              // to do about it.
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <a href="#password">{t("setPassword")}</a>
              </Button>
            )}
          </li>
        </ul>
      )}
    </PageSection>
  );
}
