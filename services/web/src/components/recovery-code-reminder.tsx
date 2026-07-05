"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check, Copy, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
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
import { trpc } from "@/lib/trpc";

// Modes the modal renders. Composed client-side from the
// `recoveryStatus` primitives ; the server doesn't bake the mode into
// its response so the policy (e.g. low-codes threshold) lives next to
// the UI that surfaces it.
type Mode =
  | { kind: "idle" }
  // Plenty of codes left ; user just used one and needs to strike it.
  | { kind: "acknowledge"; remaining: number }
  // 1 or 2 left + just used one : strike + suggest regen.
  | { kind: "acknowledgeLow"; remaining: number }
  // 1 or 2 left, no recent use : just the regen suggestion.
  | { kind: "suggestRegen"; remaining: number }
  // 0 left : blocking, must regenerate before continuing.
  | { kind: "mustRegenerate" };

const LOW_THRESHOLD = 3;

function modeFromStatus(status: {
  enrolled: boolean;
  hasUnacknowledgedUse: boolean;
  remainingCodes: number;
}): Mode {
  if (!status.enrolled) return { kind: "idle" };
  if (status.remainingCodes === 0) return { kind: "mustRegenerate" };
  if (status.hasUnacknowledgedUse && status.remainingCodes < LOW_THRESHOLD) {
    return { kind: "acknowledgeLow", remaining: status.remainingCodes };
  }
  if (status.remainingCodes < LOW_THRESHOLD) {
    return { kind: "suggestRegen", remaining: status.remainingCodes };
  }
  if (status.hasUnacknowledgedUse) {
    return { kind: "acknowledge", remaining: status.remainingCodes };
  }
  return { kind: "idle" };
}

/**
 * Strike-through animation used to remind the user which code they
 * spent. We can't show the actual code (we only stored bcrypt hashes
 * server-side) so this is purely illustrative ; five XXXX-XXXX-XXXX
 * mock lines render, then after a beat one of them gets a `line-through`
 * + opacity-50 transition to convey "find this in your saved list and
 * cross it out". Picks a different index on every mount so the
 * affordance feels alive rather than scripted.
 */
function StrikeAnimation() {
  const codes = useMemo(() => Array.from({ length: 5 }, () => "XXXX-XXXX-XXXX"), []);
  const struckIndex = useMemo(() => Math.floor(Math.random() * codes.length), [codes.length]);
  const [active, setActive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setActive(true), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <pre
      className="overflow-hidden rounded-md border border-border bg-muted/40 px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground"
      aria-hidden
    >
      {codes.map((code, i) => (
        <span
          key={i}
          className={
            "block transition-all duration-700 ease-out " +
            (i === struckIndex && active
              ? "text-muted-foreground/60 line-through decoration-destructive decoration-2"
              : "")
          }
        >
          {code}
        </span>
      ))}
    </pre>
  );
}

function NewCodesBlock({
  codes,
  copyLabel,
  copiedToast,
  copyError,
}: {
  codes: string[];
  copyLabel: string;
  copiedToast: string;
  copyError: string;
}) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      toast.success(copiedToast);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(copyError);
    }
  }
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-amber-400/30 bg-background px-4 py-3 pr-12 font-mono text-xs leading-relaxed text-foreground">
        {codes.join("\n")}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onCopy}
        aria-label={copyLabel}
        title={copyLabel}
        className="absolute right-1.5 top-1.5 h-7 w-7 text-muted-foreground hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </Button>
    </div>
  );
}

/**
 * Post-sign-in reminder mounted globally inside the (authed) layout.
 *
 * Triggers when the recovery-codes server state needs the user's
 * attention: a recovery code was used and hasn't been acknowledged, or
 * the remaining count is low (< 3), or it's hit zero.
 *
 * State survives sign-out: the unacknowledged flag lives on the
 * RecoveryCode row, the remaining-count is a derived query. So a user
 * who closes the tab without acknowledging gets re-prompted on next
 * sign-in, until they either ack the spent code or regenerate the
 * batch.
 *
 * Regeneration always requires a fresh TOTP code via the existing
 * `regenerateRecoveryCodes` mutation. We deliberately don't offer a
 * no-TOTP shortcut for "just used a recovery code, want a new batch"
 * because that would let an attacker who steals one recovery code
 * mint a fresh batch and lock the legitimate user out of the recovery
 * path entirely (one-shot incident → persistent recovery-code
 * takeover). The lost-authenticator user proceeds via account
 * recovery (support / ID verification), the industry norm.
 *
 * After regen we show the new codes inline (codeblock + copy CTA, same
 * pattern as `<TotpSection>`). The user must explicitly click "I saved
 * them" to dismiss ; without that the modal stays open even though the
 * underlying status would now be idle.
 */
export function RecoveryCodeReminder() {
  const t = useTranslations("account.totp.reminder");
  const tToast = useTranslations("account.totp");
  const utils = trpc.useUtils();
  const status = trpc.auth.totp.recoveryStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const acknowledge = trpc.auth.totp.acknowledgeRecoveryUse.useMutation({
    onSuccess: () => void utils.auth.totp.recoveryStatus.invalidate(),
  });
  const regenWithTotp = trpc.auth.totp.regenerateRecoveryCodes.useMutation({
    onSuccess: () => void utils.auth.totp.recoveryStatus.invalidate(),
  });

  // After-regen state ; the server returns the fresh codes once and we
  // show them locally until the user acknowledges they've saved them.
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [totpCode, setTotpCode] = useState("");
  // The acknowledge / acknowledgeLow / suggestRegen / mustRegenerate
  // modes all reveal the TOTP input on demand rather than always
  // showing it. Acknowledge-only paths skip the input entirely.
  const [showTotpInput, setShowTotpInput] = useState(false);
  // Lets the user dismiss the suggest / acknowledge modes for this
  // session even when they haven't taken action ; the server-state
  // policy still re-opens it on the next sign-in. mustRegenerate
  // ignores this and stays open.
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  const mode: Mode = status.data ? modeFromStatus(status.data) : { kind: "idle" };
  const isOpen =
    !status.isLoading &&
    mode.kind !== "idle" &&
    (mode.kind === "mustRegenerate" || newCodes !== null || !dismissedThisSession);
  const isBlocking = mode.kind === "mustRegenerate";

  function reset() {
    setNewCodes(null);
    setTotpCode("");
    setShowTotpInput(false);
  }

  function onAcknowledge() {
    acknowledge.mutate(undefined, {
      onSuccess: () => {
        // For the plain acknowledge mode this is the close action.
        // For acknowledgeLow it dismisses the strike-it nag but the
        // suggestRegen prompt will re-appear on next sign-in until
        // the user regenerates.
        setDismissedThisSession(true);
      },
    });
  }

  // Shared by the submit button and the OTP's auto-submit-on-complete.
  function runRegen(codeValue: string) {
    if (regenWithTotp.isPending || codeValue.length < 6) return;
    regenWithTotp.mutate(
      { code: codeValue },
      {
        onSuccess: (result) => {
          setNewCodes(result.recoveryCodes);
          setTotpCode("");
        },
        onError: (err) => {
          toast.error(err.message ?? tToast("errors.regenerate"));
        },
      },
    );
  }

  function onRegenWithTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runRegen(totpCode);
  }

  function onConfirmSaved() {
    setDismissedThisSession(true);
    reset();
  }

  // Fresh-codes view : same regardless of which mode kicked us in.
  if (newCodes) {
    return (
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent
          className="[&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t("regeneratedTitle")}</DialogTitle>
            <DialogDescription>{t("regeneratedSubtitle")}</DialogDescription>
          </DialogHeader>
          <NewCodesBlock
            codes={newCodes}
            copyLabel={tToast("recoveryCopy")}
            copiedToast={tToast("recoveryCopied")}
            copyError={tToast("errors.copy")}
          />
          <DialogFooter>
            <Button type="button" onClick={onConfirmSaved}>
              {tToast("ack")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode.kind === "idle") return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open || isBlocking) return;
        setDismissedThisSession(true);
      }}
    >
      <DialogContent
        className={isBlocking ? "[&>button]:hidden" : undefined}
        onPointerDownOutside={isBlocking ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isBlocking ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode.kind === "mustRegenerate" ? (
              <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
            )}
            {mode.kind === "mustRegenerate"
              ? t("mustRegenerateTitle")
              : mode.kind === "suggestRegen"
                ? t("lowTitle", { remaining: mode.remaining })
                : t("usedTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode.kind === "mustRegenerate"
              ? t("mustRegenerateSubtitle")
              : mode.kind === "suggestRegen"
                ? t("lowSubtitle", { remaining: mode.remaining })
                : mode.kind === "acknowledgeLow"
                  ? t("usedAndLowSubtitle", { remaining: mode.remaining })
                  : t("usedSubtitle", { remaining: mode.remaining })}
          </DialogDescription>
        </DialogHeader>

        {(mode.kind === "acknowledge" || mode.kind === "acknowledgeLow") && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("strikeHint")}
            </p>
            <StrikeAnimation />
          </div>
        )}

        {showTotpInput && (
          <form
            onSubmit={onRegenWithTotp}
            className="flex flex-col items-center gap-2 rounded-md border border-border p-3"
          >
            <Label htmlFor="reminderTotpCode" className="self-start">
              {t("totpPrompt")}
            </Label>
            <OtpCodeInput
              id="reminderTotpCode"
              value={totpCode}
              onChange={setTotpCode}
              onComplete={runRegen}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={totpCode.length < 6 || regenWithTotp.isPending}
            >
              {regenWithTotp.isPending ? t("regenerating") : t("regenerateNow")}
            </Button>
          </form>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {/* Plain acknowledge mode : just confirm + close. No regen
              CTA here ; the user can rotate codes from /account when
              they want. */}
          {mode.kind === "acknowledge" && (
            <Button type="button" onClick={onAcknowledge} disabled={acknowledge.isPending}>
              {acknowledge.isPending ? t("saving") : t("struckIt")}
            </Button>
          )}

          {/* Acknowledge + low : ack first, then encourage regen via
              TOTP. The "Regenerate now" button reveals the OTP input
              rather than firing immediately. */}
          {mode.kind === "acknowledgeLow" && !showTotpInput && (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={onAcknowledge}
                disabled={acknowledge.isPending}
              >
                {t("regenLater")}
              </Button>
              <Button type="button" onClick={() => setShowTotpInput(true)}>
                {t("regenerateNow")}
              </Button>
            </>
          )}

          {/* Just low (no recent use) : suggest regen via TOTP. */}
          {mode.kind === "suggestRegen" && !showTotpInput && (
            <>
              <Button type="button" variant="ghost" onClick={() => setDismissedThisSession(true)}>
                {t("notNow")}
              </Button>
              <Button type="button" onClick={() => setShowTotpInput(true)}>
                {t("regenerateNow")}
              </Button>
            </>
          )}

          {/* Forced (0 codes) : TOTP regen only. Users without
              authenticator access proceed via account recovery (out of
              band) ; we don't offer an in-app shortcut because it
              would let any leaked recovery code mint a fresh batch. */}
          {mode.kind === "mustRegenerate" && !showTotpInput && (
            <Button type="button" onClick={() => setShowTotpInput(true)}>
              {t("enterTotpToRegenerate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
