"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, ShieldOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

// Client-side island that handles the actual revoke click. Kept in a
// separate file so the parent server page can still use
// `getTranslations` for SSR-rendered chrome ; only the interactive
// button + result state ship as client JS.

export function RevokeDeviceForm({ token }: { token: string }) {
  const t = useTranslations("auth.revokeDevice");
  const mutation = trpc.auth.trustedDevices.revokeByEmailToken.useMutation();

  // Three rendering branches : idle (initial "confirm" CTA), success
  // (revoke landed), and error (token didn't verify). Map the
  // procedure's tagged-reason result onto a localised explanation.
  if (mutation.isSuccess) {
    const result = mutation.data;
    if (result.ok) {
      return (
        <div className="space-y-4 rounded-lg border border-emerald-400/40 bg-emerald-400/5 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">{t("successTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("successBody")}</p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/signin">{t("signin")}</Link>
          </Button>
        </div>
      );
    }
    // ok: false — token verify failed. Differentiate the reason for
    // clarity ; the user knows whether to request a fresh email or
    // contact support.
    const reasonKey =
      result.reason === "expired"
        ? "errorExpired"
        : result.reason === "wrong-purpose"
          ? "errorInvalid"
          : result.reason === "malformed"
            ? "errorInvalid"
            : "errorInvalid";
    return (
      <div className="space-y-4 rounded-lg border border-amber-400/40 bg-amber-400/5 p-6 text-center">
        <XCircle className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">{t("errorTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(reasonKey)}</p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/signin">{t("signin")}</Link>
        </Button>
      </div>
    );
  }

  if (mutation.isError) {
    // Network / 5xx — the procedure didn't even return a tagged
    // result. Distinct from the verify-failed branch above so the user
    // can retry the click instead of being told "link expired".
    return (
      <div className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
        <XCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">{t("networkErrorTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("networkErrorBody")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => mutation.mutate({ token })}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="destructive"
        className="w-full"
        onClick={() => mutation.mutate({ token })}
        disabled={mutation.isPending}
      >
        <ShieldOff className="mr-2 h-4 w-4" aria-hidden />
        {mutation.isPending ? t("revoking") : t("confirm")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("notYou")}</p>
    </div>
  );
}
