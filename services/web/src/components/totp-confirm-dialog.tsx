"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OtpCodeInput } from "@/components/otp-code-input";
import { Label } from "@/components/ui/label";

/**
 * Sequential TOTP-confirm step for critical operations (password
 * change, email change, etc.). Decoupled from the form that triggered
 * it : the form collects everything else, opens this dialog when
 * TOTP is enrolled, and the dialog hands the verified 6-digit code
 * back via `onConfirm`. The form then runs its action with the code
 * in hand.
 *
 * Why a dialog instead of an inline field on the form :
 * - Critical-action forms are dense (current password + new value +
 *   confirmation + …) ; an inline TOTP slot just below makes them
 *   feel like a security checklist, which discourages completion.
 * - Sequencing the gate moves the friction off the main path —
 *   non-TOTP-enrolled users see the same form as before with no
 *   extra step.
 * - Keeps the TOTP-input UI in one place ; sign-in stays full-page
 *   (different context, full-screen makes sense there) but every
 *   in-app re-confirmation routes through this single component.
 *
 * The dialog disposes of its internal code state on close so a stale
 * value can't leak into the next confirmation. `errorKey` lets the
 * caller surface a server-side rejection ("invalid code", "expired")
 * without mounting/unmounting the dialog.
 */
export type TotpConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called when the user submits the dialog with a 6-digit code.
   * Resolve to throw / no-op : the dialog stays open until either
   * the caller closes it via `onOpenChange(false)` or the promise
   * rejects + the caller surfaces an error via `errorKey`.
   */
  onConfirm: (code: string) => Promise<void>;
  /**
   * i18n key under `account.totp.dialog` to use for the title +
   * description copy, scoped per consumer. Falls back to a generic
   * "confirm with two-factor" prompt.
   */
  scope?: "passwordChange" | "emailChange" | "default";
  /** When set, surfaces a localised error message under the OTP field. */
  errorKey?: "invalidTotpCode" | "totpRequired" | null;
  pending?: boolean;
};

export function TotpConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  scope = "default",
  errorKey,
  pending,
}: TotpConfirmDialogProps) {
  const t = useTranslations("account.totp.dialog");
  const tErrors = useTranslations("account.password.errors");
  const [code, setCode] = useState("");

  // Wipe state on close so the next opener can't see the previous
  // code. Done inside an effect rather than in onOpenChange so
  // programmatic closes (after a successful confirm) are covered too.
  useEffect(() => {
    if (!open) setCode("");
  }, [open]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim().length !== 6 || pending) return;
    void onConfirm(code.trim());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${scope}.title`)}</DialogTitle>
          <DialogDescription>{t(`${scope}.description`)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col items-center gap-3">
          <Label htmlFor="totpDialogCode" className="self-start">
            {t("label")}
          </Label>
          <OtpCodeInput
            id="totpDialogCode"
            value={code}
            onChange={setCode}
            onComplete={(value) => {
              if (!pending) void onConfirm(value.trim());
            }}
          />
          {errorKey && <p className="self-start text-xs text-destructive">{tErrors(errorKey)}</p>}
          <DialogFooter className="w-full gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || code.trim().length !== 6}>
              {pending ? t("verifying") : t("verify")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
