"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
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
import { PageSection } from "@/components/page-section";
import { trpc } from "@/lib/trpc";

type Enrollment = { secret: string; qrSvg: string };
// Enrollment proceeds through 4 sequential stages so the dialog
// reads as a standard wizard instead of dumping the QR + secret +
// 6-digit input on the same screen at once :
//   1. `begin`    : `auth.totp.beginEnrollment` is in flight, waiting
//                   for the secret + QR.
//   2. `scan`     : QR + base32 secret on screen, primary action is
//                   "I scanned it" — no code input yet.
//   3. `verify`   : 6-digit code input + Confirm. Back button returns
//                   to `scan` if the user wants to re-check the QR.
//   4. `recovery` : recovery codes view after a successful confirm.
type EnrollStage =
  | { kind: "begin" }
  | { kind: "scan"; enrollment: Enrollment }
  | { kind: "verify"; enrollment: Enrollment }
  | { kind: "recovery"; codes: string[] };
type ManageStage = { kind: "code" } | { kind: "recovery"; codes: string[] };

/**
 * Two-factor authentication card. Status + actions live on the card ;
 * each action is hosted in its own focused modal so the security
 * page stays compact when the user isn't actively rotating their
 * 2FA setup.
 *
 *   - Configure TOTP (when not enrolled) opens a 2-step dialog :
 *     scan the QR / type the secret, confirm with a 6-digit code,
 *     then a recovery-codes screen the user must acknowledge.
 *   - Disable TOTP opens a single-step dialog asking for a 6-digit
 *     code to confirm intent (server requires it).
 *   - Regenerate recovery codes opens a 2-step dialog : enter a
 *     6-digit code, then display the new codes alongside a copy
 *     button + acknowledgement.
 *
 * Each dialog wipes its own state on open so a previous abandoned
 * attempt doesn't leak in.
 */
export function TotpSection() {
  const t = useTranslations("account.totp");
  const status = trpc.auth.totp.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const data = status.data;
  const enrolled = Boolean(data && "enrolled" in data && data.enrolled);
  const active = enrolled && data && "activatedAt" in data && Boolean(data.activatedAt);
  const remainingRecoveryCodes =
    data && "remainingRecoveryCodes" in data ? data.remainingRecoveryCodes : null;

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  return (
    <PageSection title={t("title")} subtitle={active ? t("subtitleActive") : t("subtitleInactive")}>
      {!active && (
        <Button variant="outline" onClick={() => setEnrollOpen(true)}>
          {t("enroll")}
        </Button>
      )}
      {active && (
        <div className="space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("fields.recoveryRemaining")}</dt>
            <dd>{remainingRecoveryCodes ?? "—"}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setRegenOpen(true)}>
              {t("regenerate")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisableOpen(true)}
              className="text-destructive hover:text-destructive"
            >
              {t("disable")}
            </Button>
          </div>
        </div>
      )}

      <TotpEnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} />
      <TotpDisableDialog open={disableOpen} onOpenChange={setDisableOpen} />
      <TotpRegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} />
    </PageSection>
  );
}

function TotpEnrollDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("account.totp");
  const utils = trpc.useUtils();
  const beginEnrollment = trpc.auth.totp.beginEnrollment.useMutation();
  const confirmEnrollment = trpc.auth.totp.confirmEnrollment.useMutation({
    onSuccess: () => {
      void utils.auth.totp.status.invalidate();
      void utils.auth.totp.adminEnforcement.invalidate();
    },
  });

  const [stage, setStage] = useState<EnrollStage>({ kind: "begin" });
  const [enrollCode, setEnrollCode] = useState("");
  // Triggered exactly once per open transition : kicks off
  // `beginEnrollment` which mints a fresh secret + QR. The ref guard
  // ensures the network call only fires once even though the effect
  // re-runs on every render (the mutation hook returns a new object
  // identity each time, so we can't actually pin it in the deps
  // array). NO cancellation flag — the previous version cancelled
  // the in-flight request the moment the mutation's `isPending`
  // re-render changed `beginEnrollment`'s identity, leaving the
  // dialog frozen on "Preparing…" forever ; we deliberately let the
  // promise resolve unconditionally now.
  const lastOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      lastOpenRef.current = false;
      return;
    }
    if (lastOpenRef.current) return;
    lastOpenRef.current = true;
    setStage({ kind: "begin" });
    setEnrollCode("");
    beginEnrollment.mutate(undefined, {
      onSuccess: (result) => {
        setStage({ kind: "scan", enrollment: result });
      },
      onError: (err) => {
        toast.error(err.message || t("errors.enroll"));
        onOpenChange(false);
      },
    });
  }, [open, beginEnrollment, onOpenChange, t]);

  async function onConfirm(codeValue: string) {
    if (stage.kind !== "verify" || confirmEnrollment.isPending) return;
    if (codeValue.trim().length !== 6) return;
    try {
      const result = await confirmEnrollment.mutateAsync({
        code: codeValue.trim(),
      });
      setStage({ kind: "recovery", codes: result.recoveryCodes });
      setEnrollCode("");
      toast.success(t("enrolledSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.confirm"));
    }
  }

  // Per-stage title + subtitle drives the dialog header copy. Keeping
  // the lookup here so the JSX stays linear ; each stage maps to a
  // distinct i18n pair.
  const headerCopy = (() => {
    if (stage.kind === "recovery") {
      return { title: t("recoveryTitle"), subtitle: t("saveRecoveryHint") };
    }
    if (stage.kind === "verify") {
      return { title: t("enrollVerifyTitle"), subtitle: t("enrollVerifySubtitle") };
    }
    // begin + scan share the "scan" header copy : during `begin` the
    // body is just the spinner, so the operator sees a stable header
    // while the network call resolves.
    return { title: t("enrollScanTitle"), subtitle: t("enrollScanSubtitle") };
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{headerCopy.title}</DialogTitle>
          <DialogDescription>{headerCopy.subtitle}</DialogDescription>
        </DialogHeader>

        {(stage.kind === "begin" || beginEnrollment.isPending) && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("enrolling")}</p>
        )}

        {stage.kind === "scan" && (
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted-foreground">{t("scanQr")}</p>
            <div className="flex justify-center">
              <div
                role="img"
                aria-label="TOTP QR"
                className="inline-block rounded border border-border p-3 text-foreground [&_svg]:h-50 [&_svg]:w-50"
                dangerouslySetInnerHTML={{ __html: stage.enrollment.qrSvg }}
              />
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {t("cantScan")}
              </summary>
              <div className="mt-2">
                <SecretCodeBlock secret={stage.enrollment.secret} />
              </div>
            </details>
          </div>
        )}

        {stage.kind === "verify" && (
          <div className="grid gap-3 py-2">
            <Label htmlFor="enrollCode">{t("enrollCodePrompt")}</Label>
            <div className="flex justify-center">
              <OtpCodeInput
                id="enrollCode"
                value={enrollCode}
                onChange={setEnrollCode}
                onComplete={onConfirm}
              />
            </div>
          </div>
        )}

        {stage.kind === "recovery" && <RecoveryCodesView codes={stage.codes} />}

        <DialogFooter>
          {stage.kind === "scan" && (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => setStage({ kind: "verify", enrollment: stage.enrollment })}
              >
                {t("continue")}
              </Button>
            </>
          )}
          {stage.kind === "verify" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStage({ kind: "scan", enrollment: stage.enrollment })}
                disabled={confirmEnrollment.isPending}
              >
                {t("back")}
              </Button>
              <Button
                type="button"
                onClick={() => onConfirm(enrollCode)}
                disabled={confirmEnrollment.isPending || enrollCode.length < 6}
              >
                {confirmEnrollment.isPending ? t("confirming") : t("confirm")}
              </Button>
            </>
          )}
          {stage.kind === "recovery" && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t("ack")}
            </Button>
          )}
          {stage.kind === "begin" && !beginEnrollment.isPending && (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TotpDisableDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("account.totp");
  const utils = trpc.useUtils();
  const disable = trpc.auth.totp.disable.useMutation({
    onSuccess: () => {
      void utils.auth.totp.status.invalidate();
      void utils.auth.totp.adminEnforcement.invalidate();
    },
  });
  const [code, setCode] = useState("");

  useEffect(() => {
    if (open) setCode("");
  }, [open]);

  async function onSubmit(codeValue: string) {
    if (disable.isPending || codeValue.trim().length !== 6) return;
    try {
      await disable.mutateAsync({ code: codeValue.trim() });
      onOpenChange(false);
      toast.success(t("disabledSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.disable"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("disableTitle")}</DialogTitle>
          <DialogDescription>{t("disableSubtitle")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="disableCode">{t("disablePrompt")}</Label>
          <div className="flex justify-center">
            <OtpCodeInput
              id="disableCode"
              value={code}
              onChange={setCode}
              onComplete={onSubmit}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={disable.isPending}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onSubmit(code)}
            disabled={disable.isPending || code.length < 6}
          >
            {disable.isPending ? t("disablePending") : t("disable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TotpRegenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("account.totp");
  const utils = trpc.useUtils();
  const regenerate = trpc.auth.totp.regenerateRecoveryCodes.useMutation({
    onSuccess: () => {
      void utils.auth.totp.status.invalidate();
    },
  });
  const [stage, setStage] = useState<ManageStage>({ kind: "code" });
  const [code, setCode] = useState("");

  useEffect(() => {
    if (open) {
      setStage({ kind: "code" });
      setCode("");
    }
  }, [open]);

  async function onSubmit(codeValue: string) {
    if (regenerate.isPending || codeValue.trim().length !== 6) return;
    try {
      const result = await regenerate.mutateAsync({ code: codeValue.trim() });
      setStage({ kind: "recovery", codes: result.recoveryCodes });
      setCode("");
      toast.success(t("regeneratedSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.regenerate"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stage.kind === "recovery" ? t("recoveryTitle") : t("regenerateTitle")}
          </DialogTitle>
          <DialogDescription>
            {stage.kind === "recovery" ? t("saveRecoveryHint") : t("regenerateSubtitle")}
          </DialogDescription>
        </DialogHeader>

        {stage.kind === "code" && (
          <div className="grid gap-2 py-2">
            <Label htmlFor="regenCode">{t("regeneratePrompt")}</Label>
            <div className="flex justify-center">
              <OtpCodeInput
                id="regenCode"
                value={code}
                onChange={setCode}
                onComplete={onSubmit}
              />
            </div>
          </div>
        )}

        {stage.kind === "recovery" && <RecoveryCodesView codes={stage.codes} />}

        <DialogFooter>
          {stage.kind === "code" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={regenerate.isPending}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => onSubmit(code)}
                disabled={regenerate.isPending || code.length < 6}
              >
                {regenerate.isPending ? t("regeneratePending") : t("regenerate")}
              </Button>
            </>
          )}
          {stage.kind === "recovery" && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t("ack")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretCodeBlock({ secret }: { secret: string }) {
  // Same codeblock + copy-button pattern as `RecoveryCodesView` so the
  // "Can't scan ?" fallback affords a one-click paste into the
  // authenticator app's manual-entry field. Mirrors the recovery
  // codes view (sans the amber framing — the secret is sensitive but
  // not the same kind of one-shot artifact, and the dialog already
  // colour-codes the bigger surface).
  const t = useTranslations("account.totp");
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success(t("secretCopied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("errors.copy"));
    }
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border border-border bg-background px-4 py-3 pr-12 font-mono text-xs leading-relaxed text-foreground">
        {secret}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onCopy}
        aria-label={t("secretCopy")}
        title={t("secretCopy")}
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

function RecoveryCodesView({ codes }: { codes: string[] }) {
  const t = useTranslations("account.totp");
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const text = codes.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("recoveryCopied"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("errors.copy"));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
      <p className="text-sm font-semibold text-amber-500">{t("saveRecovery")}</p>
      {/*
        Codeblock + copy CTA top-right. The codes are opaque tokens so
        mono + line-per-code makes them easy to scan + transcribe into
        a password manager.
      */}
      <div className="relative">
        <pre className="overflow-x-auto rounded-md border border-amber-400/30 bg-background px-4 py-3 pr-12 font-mono text-xs leading-relaxed text-foreground">
          {codes.join("\n")}
        </pre>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCopy}
          aria-label={t("recoveryCopy")}
          title={t("recoveryCopy")}
          className="absolute right-1.5 top-1.5 h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );
}
