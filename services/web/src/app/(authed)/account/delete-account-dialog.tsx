"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestAccountDeletionAction, type DeleteAccountErrorCode } from "./actions";

/**
 * Modal-form replacement for the previous `/account/delete` page. The
 * form moved here because (a) opening a separate route for a one-off
 * destructive confirmation was unusual ; (b) the user lands on the
 * danger surface from `/account/danger` already, so an inline
 * dialog keeps them in context. Behaviour is otherwise the same as
 * the page version : typed-email confirmation gate, server action
 * sets `User.deletedAt`, then signs the user out + redirects to
 * `/signin?deletionScheduledAt=<iso>` for the post-signout banner to
 * pick up.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const t = useTranslations("account.delete");
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [errorCode, setErrorCode] = useState<DeleteAccountErrorCode | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = confirmation.trim().toLowerCase() === email.toLowerCase() && !isPending;

  function handleClose(next: boolean) {
    if (!next && !isPending) {
      // Reset on close so re-opening doesn't show a leftover error /
      // half-typed confirmation.
      setConfirmation("");
      setErrorCode(null);
    }
    onOpenChange(next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    startTransition(async () => {
      const result = await requestAccountDeletionAction({
        emailConfirmation: confirmation,
      });
      if (!result.ok) {
        setErrorCode(result.errorCode);
        return;
      }
      const when = encodeURIComponent(result.deletionCompletesAt);
      router.push(`/signin?deletionScheduledAt=${when}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-destructive">{t("heading")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("bullets.memberships")}</li>
          <li>{t("bullets.content")}</li>
          <li>{t("bullets.retained")}</li>
          <li>{t("bullets.grace")}</li>
        </ul>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="confirmation">{t("confirmPrompt", { email })}</Label>
            <Input
              id="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={email}
              autoComplete="off"
            />
          </div>
          {errorCode && <p className="text-sm text-destructive">{t(`errors.${errorCode}`)}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={!canSubmit}>
              {isPending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
