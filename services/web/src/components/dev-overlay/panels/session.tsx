"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/(anon)/signin/actions";
import { trpc } from "@/lib/trpc";
import { CollapsibleSection } from "../collapsible-section";

export function SessionPanel() {
  const t = useTranslations("devOverlay");
  const { data, isLoading, error, refetch, isFetching } = trpc.users.me.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [isSigningOut, startSignOut] = useTransition();

  const signedIn = Boolean(data);
  const badge = (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
        signedIn ? "bg-emerald-400/20 text-emerald-400" : "bg-border text-muted-foreground"
      }`}
    >
      {signedIn ? t("badges.signedIn") : t("badges.anon")}
    </span>
  );

  return (
    <CollapsibleSection title={t("sections.session")} badge={badge}>
      <div className="space-y-3">
        {isLoading && <p className="text-xs opacity-60">{t("session.resolving")}</p>}
        {error && (
          <p className="text-xs text-red-400">
            {t("errorPrefix")} <span className="font-mono">{error.message}</span>
          </p>
        )}

        {!isLoading && !error && !data && (
          <>
            <p className="text-xs text-muted-foreground">{t("session.notSignedIn")}</p>
            <div className="flex gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-7 flex-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Link href="/signup">{t("signUp")}</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-7 flex-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Link href="/signin">{t("signIn")}</Link>
              </Button>
            </div>
          </>
        )}

        {data && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
              <dt className="text-muted-foreground">{t("session.fields.id")}</dt>
              <dd className="truncate">{data.id}</dd>
              <dt className="text-muted-foreground">{t("session.fields.email")}</dt>
              <dd className="truncate">{data.email}</dd>
              <dt className="text-muted-foreground">{t("session.fields.name")}</dt>
              <dd className="truncate">{data.displayName ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("session.fields.locale")}</dt>
              <dd>{data.localePreference}</dd>
              <dt className="text-muted-foreground">{t("session.fields.verified")}</dt>
              <dd className={data.emailVerifiedAt ? "text-emerald-400" : "text-amber-400"}>
                {data.emailVerifiedAt
                  ? new Date(data.emailVerifiedAt).toISOString()
                  : t("session.verifiedNo")}
              </dd>
            </dl>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {isFetching ? "…" : t("refetch")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => startSignOut(() => signOutAction("local"))}
                disabled={isSigningOut}
                className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                {isSigningOut ? "…" : t("signOut")}
              </Button>
            </div>
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}
