"use client";

import { useTranslations } from "next-intl";
import { KeyRound, Link2 } from "lucide-react";
import { OAUTH_PROVIDER_LABELS } from "@monark/auth/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSection } from "@/components/page-section";
import { trpc } from "@/lib/trpc";

/**
 * Read-only inventory of how this account can authenticate : the
 * providers Supabase has linked to it, plus whether an email +
 * password credential exists.
 *
 * Read-only on purpose for now. Unlinking is the operation that can
 * lock someone out (drop your only provider with no password set and
 * the account becomes unreachable), so it needs its own "you'd have no
 * way back in" guard rather than riding along with this list. Tracked
 * as a follow-up in the module README.
 */
export function ConnectedAccountsSection() {
  const t = useTranslations("account.connectedAccounts");
  const identities = trpc.auth.oauth.identities.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      {identities.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ul className="space-y-2">
          {identities.data?.providers.map((provider) => (
            <li
              key={provider}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{OAUTH_PROVIDER_LABELS[provider]}</span>
              <span className="ml-auto text-xs text-muted-foreground">{t("connected")}</span>
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-lg border border-border p-3">
            <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">{t("password")}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {identities.data?.hasPassword ? t("connected") : t("notSet")}
            </span>
          </li>
        </ul>
      )}
    </PageSection>
  );
}
