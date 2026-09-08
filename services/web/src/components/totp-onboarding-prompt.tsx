"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
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

  // The cached query answer is the *only* thing that decides visibility.
  //
  // It used to be `query && !localState`, which reopened the modal after
  // a dismissal: this component is mounted in the (authed) layout, so a
  // client-side navigation remounts it with the local flag back at its
  // initial value while the query cache still held `shouldPrompt: true`
  // — the invalidated refetch hadn't landed yet. Writing the answer into
  // the cache instead survives remounts, because the cache doesn't.
  const open = status.data?.shouldPrompt === true;

  function suppress() {
    utils.auth.totp.onboardingStatus.setData(undefined, { shouldPrompt: false });
  }

  function onDismiss() {
    if (dismiss.isPending) return;
    // Cache first so the close is instant and remount-proof, then
    // persist. On failure we put the question back rather than silently
    // swallowing a decision that never reached the database.
    suppress();
    dismiss.mutate(undefined, {
      onError: () => {
        void utils.auth.totp.onboardingStatus.invalidate();
      },
    });
  }

  function onEnable() {
    // Cache-only, deliberately not persisted : if the user abandons
    // enrollment the prompt is gone for this session but returns on a
    // later load, which is the right behaviour for an unfinished intent.
    // Completing enrollment makes `shouldPrompt` false server-side
    // anyway, via `isTotpActive`.
    suppress();
    startNavigation(() => {
      // `?enroll=totp` opens the enrollment wizard on arrival. Landing on
      // the page and asking the user to find the button again is a second
      // decision to make after they already said yes here ; the security
      // page consumes the param and strips it so a refresh or a shared URL
      // doesn't reopen the dialog.
      router.push("/account/security?enroll=totp");
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
