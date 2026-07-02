"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CollapsibleSection } from "../collapsible-section";

type Enrollment = { secret: string; qrSvg: string };

export function TotpPanel() {
  const t = useTranslations("devOverlay");
  const utils = trpc.useUtils();
  const status = trpc.auth.totp.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const beginEnrollment = trpc.auth.totp.beginEnrollment.useMutation();
  const confirmEnrollment = trpc.auth.totp.confirmEnrollment.useMutation({
    onSuccess: () => void utils.auth.totp.status.invalidate(),
  });
  const disable = trpc.auth.totp.disable.useMutation({
    onSuccess: () => void utils.auth.totp.status.invalidate(),
  });

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);

  const data = status.data;
  const enrolled = Boolean(data && "enrolled" in data && data.enrolled);
  const active = enrolled && data && "activatedAt" in data && Boolean(data.activatedAt);

  const badge = (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
        active ? "bg-emerald-400/20 text-emerald-400" : "bg-border text-muted-foreground"
      }`}
    >
      {active ? t("totp.active") : t("totp.inactive")}
    </span>
  );

  async function onBegin() {
    setRecoveryCodes(null);
    const result = await beginEnrollment.mutateAsync();
    setEnrollment(result);
  }

  async function onConfirm() {
    setRecoveryCodes(null);
    try {
      const result = await confirmEnrollment.mutateAsync({
        code: enrollCode.trim(),
      });
      setRecoveryCodes(result.recoveryCodes);
      setEnrollment(null);
      setEnrollCode("");
    } catch {
      // error surfaces via mutation.error below
    }
  }

  async function onDisable() {
    setDisableError(null);
    try {
      await disable.mutateAsync({ code: disableCode.trim() });
      setDisableCode("");
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : t("totp.errors.disable"));
    }
  }

  return (
    <CollapsibleSection title={t("sections.totp")} badge={badge}>
      <div className="space-y-3">
        {status.isLoading && <p className="text-xs opacity-60">{t("totp.resolving")}</p>}
        {status.error && (
          <p className="text-xs text-red-400">
            {t("errorPrefix")} <span className="font-mono">{status.error.message}</span>
          </p>
        )}

        {!status.isLoading && !status.error && !enrolled && !enrollment && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("totp.notEnrolled")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={onBegin}
              disabled={beginEnrollment.isPending}
              className="h-7 text-xs"
            >
              {beginEnrollment.isPending ? "…" : t("totp.enroll")}
            </Button>
          </div>
        )}

        {enrollment && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("totp.scanQr")}
            </p>
            <div
              role="img"
              aria-label="TOTP QR"
              className="rounded border border-border p-2 text-foreground [&_svg]:h-45 [&_svg]:w-45"
              dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
            />
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              {enrollment.secret}
            </p>
            <Input
              value={enrollCode}
              onChange={(event) => setEnrollCode(event.target.value)}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              className="h-8 font-mono text-sm"
            />
            {confirmEnrollment.error && (
              <p className="text-[10px] text-destructive">{confirmEnrollment.error.message}</p>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onConfirm}
                disabled={confirmEnrollment.isPending || enrollCode.length < 6}
                className="h-7 flex-1 text-xs"
              >
                {confirmEnrollment.isPending ? "…" : t("totp.confirm")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEnrollment(null);
                  setEnrollCode("");
                }}
                className="h-7 text-xs"
              >
                {t("totp.cancel")}
              </Button>
            </div>
          </div>
        )}

        {recoveryCodes && (
          <div className="space-y-2 rounded border border-amber-400/30 bg-amber-400/10 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              {t("totp.saveRecovery")}
            </p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-[10px]">
              {recoveryCodes.map((code) => (
                <li key={code} className="truncate">
                  {code}
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRecoveryCodes(null)}
              className="h-6 text-[10px]"
            >
              {t("totp.ack")}
            </Button>
          </div>
        )}

        {active && !enrollment && (
          <div className="space-y-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
              <dt className="text-muted-foreground">{t("totp.fields.recoveryRemaining")}</dt>
              <dd>
                {data && "remainingRecoveryCodes" in data ? data.remainingRecoveryCodes : "—"}
              </dd>
            </dl>
            <div className="flex items-center gap-2">
              <Input
                value={disableCode}
                onChange={(event) => setDisableCode(event.target.value)}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                className="h-7 flex-1 font-mono text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={onDisable}
                disabled={disable.isPending || disableCode.length < 6}
                className="h-7 text-[10px] text-destructive hover:text-destructive"
              >
                {disable.isPending ? "…" : t("totp.disable")}
              </Button>
            </div>
            {disableError && <p className="text-[10px] text-destructive">{disableError}</p>}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => void status.refetch()}
          disabled={status.isFetching}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {status.isFetching ? "…" : t("refetch")}
        </Button>
      </div>
    </CollapsibleSection>
  );
}
