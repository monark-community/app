"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { checkPasswordOffline } from "@monark/auth/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { trpc } from "@/lib/trpc";
import { resetPasswordAction, type ResetPasswordResult } from "./actions";

export function ResetPasswordForm({ email }: { email: string }) {
  const t = useTranslations("auth.resetPassword");
  // Drives the sequential TOTP dialog : enrolled users hit Submit →
  // dialog opens → enter code → action runs ; non-enrolled users skip
  // the dialog entirely. Server-side `resetPasswordAction` enforces
  // the same gate, so a stale client can't bypass.
  const totpStatus = trpc.auth.totp.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const totpEnrolled = Boolean(
    totpStatus.data && "enrolled" in totpStatus.data && totpStatus.data.enrolled,
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<"invalidTotpCode" | "totpRequired" | null>(null);

  // Same offline rule set used at signup + the in-account password
  // change. Email comes from the recovery-flow session ; passing it as
  // context keeps the "doesn't contain your email" rule live.
  const strength = useMemo(
    () => checkPasswordOffline(newPassword, { email }),
    [newPassword, email],
  );

  function commitReset(totpCode?: string) {
    startTransition(async () => {
      // The action returns `ResetPasswordResult` on failure but
      // `redirect()`s on success ; the redirect throws the
      // NEXT_REDIRECT sentinel which propagates as a navigation,
      // never reaches this client code with a value. Narrow on `ok`
      // so TS sees the failure shape on the error branches.
      const result: ResetPasswordResult | void = await resetPasswordAction({
        newPassword,
        totpCode,
      });
      if (!result || result.ok) return;
      if (result.errorCode === "invalidTotpCode" || result.errorCode === "totpRequired") {
        // Surface inside the dialog so the user can retry without
        // re-typing their password. The dialog's onConfirm re-runs
        // commitReset with a fresh code.
        setDialogError(result.errorCode);
        return;
      }
      toast.error(t(`errors.${result.errorCode}`));
      setDialogOpen(false);
      setDialogError(null);
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    if (totpEnrolled) {
      setDialogError(null);
      setDialogOpen(true);
      return;
    }
    commitReset();
  }

  return (
    <Card className="shadow-none border-border">
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {/* Hidden `username` field so password managers update the
              correct entry instead of creating a brand-new one with
              no email. The recovery flow knows the user's email
              (from the verified recovery session) so we surface it
              for the manager to match against. Not displayed, not
              submitted. */}
          <input
            type="text"
            name="username"
            value={email}
            autoComplete="username"
            readOnly
            hidden
          />
          <div className="grid gap-2">
            <Label htmlFor="newPassword">{t("labels.new")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              autoComplete="new-password"
              autoFocus
            />
            <PasswordStrengthMeter score={strength.score} visible={newPassword.length > 0} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">{t("labels.confirm")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
            />
            {mismatch && <p className="text-xs text-destructive">{t("errors.mismatch")}</p>}
          </div>
          <Button type="submit" disabled={isPending || !strength.ok} className="w-full">
            {isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>

      <TotpConfirmDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) setDialogError(null);
          setDialogOpen(next);
        }}
        onConfirm={async (code) => {
          setDialogError(null);
          commitReset(code);
        }}
        scope="passwordChange"
        errorKey={dialogError}
        pending={isPending}
      />
    </Card>
  );
}
