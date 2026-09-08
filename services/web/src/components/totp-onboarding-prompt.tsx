"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

/**
 * One-time nudge to turn on two-factor, shown once a user's email is
 * verified and they haven't enrolled.
 *
 * Placed after verification rather than during signup on purpose: that's
 * the first moment the account is actually worth protecting and the
 * first moment recovery codes have a confirmed address to fall back on.
 * It is also where `/auth/confirm` now lands the user, so the prompt
 * meets them on arrival instead of interrupting a later task.
 *
 * Deliberately not a blocking gate. It offers the enrollment page and a
 * "not now" that sticks — `/account/security` keeps the path open
 * forever, and a nudge that reappears every navigation is a nag. The
 * whole thing is behind the `auth.totp-onboarding-prompt` flag, since
 * enabling it on an existing deployment shows this once to every
 * not-yet-enrolled user.
 *
 * Sibling of `<RecoveryCodeReminder>`: same mount point, same
 * server-owned-state approach, so neither can be dismissed by wiping
 * local storage.
 */
export function TotpOnboardingPrompt() {
  const t = useTranslations("account.totpOnboarding");
  const router = useRouter();
  const utils = trpc.useUtils();
  const status = trpc.auth.totp.onboardingStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const dismiss = trpc.auth.totp.dismissOnboarding.useMutation();
  const [isNavigating, startNavigation] = useTransition();
  // Local suppression so the modal closes instantly on click rather than
  // waiting for the mutation + refetch round trip.
  const [closed, setClosed] = useState(false);

  const open = Boolean(status.data?.shouldPrompt) && !closed;

  function onDismiss() {
    setClosed(true);
    dismiss.mutate(undefined, {
      onSettled: () => {
        void utils.auth.totp.onboardingStatus.invalidate();
      },
    });
  }

  function onEnable() {
    // Not dismissed : if the user backs out of enrollment the prompt is
    // gone for this page load but returns on the next one, which is the
    // behaviour we want for an unfinished intent.
    setClosed(true);
    startNavigation(() => {
      router.push("/account/security");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing via Escape / backdrop counts as "not now" — an
        // explicit decision either way, so it shouldn't come back.
        if (!next) onDismiss();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDismiss} disabled={isNavigating}>
            {t("notNow")}
          </Button>
          <Button type="button" onClick={onEnable} disabled={isNavigating}>
            {t("enable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
