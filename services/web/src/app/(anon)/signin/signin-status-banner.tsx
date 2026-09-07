"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

// Refusal reasons the /auth/callback handler can bounce back with. Any
// other value (a provider-specific error code we don't recognise) falls
// through to the generic message rather than rendering a raw key.
const OAUTH_ERROR_KEYS = [
  "cancelled",
  "no-email",
  "email-unverified",
  "email-collision",
  "disabled",
  "exchange-failed",
] as const;

function oauthErrorKey(raw: string | null): string | null {
  if (!raw) return null;
  return (OAUTH_ERROR_KEYS as readonly string[]).includes(raw) ? raw : "fallback";
}

// Date is formatted in the user's app-preference locale (next-intl
// `useLocale()`), not the runtime / browser default — a French user
// signing back in from an English-OS device sees French formatting.
// Fallback array `[locale, "en"]` so an unrecognised locale resolves
// to English instead of throwing.
function formatDate(iso: string, locale: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString([locale, "en"], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Surfaces inline confirmation when the user lands on /signin from a
// completed flow (email change confirmed, account deletion scheduled).
// Both flows force sign-out, so the user lands here without any session;
// the banner explains *why* they're back at /signin.
export function SignInStatusBanner() {
  const t = useTranslations("auth.signIn.banners");
  const locale = useLocale();
  const params = useSearchParams();

  const emailChanged = params.get("emailChanged") === "1";
  const passwordReset = params.get("passwordReset") === "1";
  const deletionScheduledAt = params.get("deletionScheduledAt");
  const oauthError = oauthErrorKey(params.get("oauthError"));

  // Ranked first : it explains a round trip the user just watched fail,
  // and the other banners describe flows that completed successfully.
  if (oauthError) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-destructive">{t("oauthError.title")}</p>
          <p className="text-xs text-muted-foreground">{t(`oauthError.reasons.${oauthError}`)}</p>
        </div>
      </div>
    );
  }

  if (emailChanged) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("emailChanged.title")}</p>
          <p className="text-xs text-muted-foreground">{t("emailChanged.subtitle")}</p>
        </div>
      </div>
    );
  }

  if (passwordReset) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("passwordReset.title")}</p>
          <p className="text-xs text-muted-foreground">{t("passwordReset.subtitle")}</p>
        </div>
      </div>
    );
  }

  if (deletionScheduledAt) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-amber-500">{t("deletionScheduled.title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("deletionScheduled.subtitle", {
              date: formatDate(deletionScheduledAt, locale),
            })}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
