"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandedAppLogoView } from "@/components/branded-app-logo-view";
import { Button } from "@/components/ui/button";

/**
 * Segment error boundary for the authed app. Catches render / data errors
 * thrown by any page under `(authed)/...` and renders a branded, i18n'd
 * recovery surface with a retry (`reset()`) instead of dropping the user on
 * Next's unstyled default error page. The `(authed)/layout` above this
 * boundary — and its AppBar — stays mounted, so only the page content is
 * replaced.
 */
export default function AuthedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  useEffect(() => {
    // Surface the error for the browser console / error-tracking hook once
    // one is wired (see docs/archive/audit-2026-07-01/collaboration.md).
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Client error boundary: can't fetch server-side, so render the view
            with the static template brand (no singleton-org logo lookup). */}
        <BrandedAppLogoView
          data={{
            singletonLogoUrl: null,
            singletonDisplayName: null,
            isSingleTenantBootstrapped: false,
          }}
          size={48}
          className="mx-auto"
        />
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => reset()}>
            {t("retry")}
          </Button>
          <Button asChild size="sm">
            <Link href="/">{t("home")}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
