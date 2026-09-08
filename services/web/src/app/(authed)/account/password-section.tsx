"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { checkPasswordOffline } from "@monark/auth/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";
import { PageSection } from "@/components/page-section";
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog";
import { trpc } from "@/lib/trpc";
import {
  changePasswordAction,
  setPasswordAction,
  type ChangePasswordResult,
  type SetPasswordResult,
} from "./actions";

/**
 * Password-change card. The form was inline before ; now it's hosted
 * inside a modal Dialog so the security page stays compact when the
 * user isn't actively rotating their password. Clicking the "Change
 * password" button opens the dialog ; submitting closes the dialog
 * on success and toasts. Inline state is wiped each open so a
 * previous abandoned attempt doesn't leak into the next.
 *
 * TOTP-enrolled users hit the sequential `<TotpConfirmDialog>` after
 * submit ; non-enrolled users skip straight to the action call. The
 * server-side gate is the actual security boundary, the dialog is UX.
 *
 * Two modes. An account that registered through a social provider has
 * no password at all, so there's no current password to ask for ; that
 * variant drops the first field and calls `setPasswordAction` instead.
 * `auth.oauth.identities` decides which one renders, and the same
 * distinction is enforced server-side — the set path refuses outright
 * once a password exists.
 */
export function PasswordSection() {
  const t = useTranslations("account.password");
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const identities = trpc.auth.oauth.identities.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const hasPassword = identities.data?.hasPassword ?? false;
  const totpStatus = trpc.auth.totp.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const totpEnrolled = Boolean(
    totpStatus.data && "enrolled" in totpStatus.data && totpStatus.data.enrolled,
  );
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<"invalidTotpCode" | "totpRequired" | null>(null);

  // Reset every time the modal opens so a half-finished attempt
  // doesn't leak across opens.
  useEffect(() => {
    if (open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMismatch(false);
      setDialogError(null);
    }
  }, [open]);

  const strength = useMemo(
    () =>
      checkPasswordOffline(newPassword, {
        email: me.data?.email ?? undefined,
        displayName: me.data?.displayName ?? undefined,
      }),
    [newPassword, me.data?.email, me.data?.displayName],
  );

  function commitChange(totpCode?: string) {
    startTransition(async () => {
      const result: ChangePasswordResult | SetPasswordResult = hasPassword
        ? await changePasswordAction({ currentPassword, newPassword, totpCode })
        : await setPasswordAction({ newPassword, totpCode });
      if (result.ok) {
        toast.success(hasPassword ? t("success") : t("set.success"));
        setOpen(false);
        setDialogOpen(false);
        setDialogError(null);
        return;
      }
      if (result.errorCode === "invalidTotpCode" || result.errorCode === "totpRequired") {
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
    commitChange();
  }

  return (
    <PageSection title={t("title")} subtitle={hasPassword ? t("subtitle") : t("set.subtitle")}>
      {identities.isLoading ? (
        <Skeleton className="h-9 w-40" />
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          {hasPassword ? t("change") : t("set.cta")}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{hasPassword ? t("dialogTitle") : t("set.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {hasPassword ? t("dialogSubtitle") : t("set.dialogSubtitle")}
            </DialogDescription>
          </DialogHeader>
          <form id="password-change-form" onSubmit={onSubmit} className="grid gap-3 py-2">
            {/* Hidden `username` field so password managers update the
                correct credential entry instead of creating a brand-new
                one. The value comes from the authed user's email ;
                not displayed, never submitted to our server. */}
            {me.data?.email && (
              <input
                type="text"
                name="username"
                value={me.data.email}
                autoComplete="username"
                readOnly
                hidden
              />
            )}
            {/* Absent in "set" mode : a social-only account has no
                current password, and rendering a required field it
                could never satisfy would dead-end the form. */}
            {hasPassword && (
              <div className="grid gap-2">
                <Label htmlFor="currentPassword">{t("labels.current")}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="newPassword">{t("labels.new")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                autoComplete="new-password"
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
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" form="password-change-form" disabled={isPending || !strength.ok}>
              {isPending ? t("submitting") : hasPassword ? t("submit") : t("set.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TotpConfirmDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) setDialogError(null);
          setDialogOpen(next);
        }}
        onConfirm={async (code) => {
          setDialogError(null);
          commitChange(code);
        }}
        scope="passwordChange"
        errorKey={dialogError}
        pending={isPending}
      />
    </PageSection>
  );
}
