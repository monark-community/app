"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";
import {
  resendConfirmationAction,
  verifyOtpAction,
  type ResendErrorCode,
  type VerifyOtpErrorCode,
} from "./actions";

type Status =
  | { kind: "idle" }
  | { kind: "sent"; remaining: number }
  | { kind: "error"; errorCode: ResendErrorCode };

export function CheckEmailActions({ email }: { email: string | null }) {
  const t = useTranslations("auth.checkEmail");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [otp, setOtp] = useState("");
  const [otpErrorCode, setOtpErrorCode] = useState<VerifyOtpErrorCode | null>(null);
  const [isResending, startResend] = useTransition();
  const [isVerifying, startVerify] = useTransition();

  function onResend() {
    if (!email) return;
    setStatus({ kind: "idle" });
    startResend(async () => {
      const result = await resendConfirmationAction(email);
      if (result.ok) {
        setStatus({ kind: "sent", remaining: result.remaining });
      } else {
        setStatus({ kind: "error", errorCode: result.errorCode });
      }
    });
  }

  function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || otp.length !== 6) return;
    setOtpErrorCode(null);
    startVerify(async () => {
      const result = await verifyOtpAction({ email, token: otp });
      if (result && !result.ok) setOtpErrorCode(result.errorCode);
    });
  }

  const resendMessage =
    status.kind === "sent"
      ? { tone: "success" as const, text: t("resendSuccess", { remaining: status.remaining }) }
      : status.kind === "error"
        ? {
            tone: "error" as const,
            text: status.errorCode === "exhausted" ? t("resendExhausted") : t("errors.invalidCode"),
          }
        : null;

  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col gap-5 pt-6">
        <form onSubmit={onVerify} className="flex flex-col items-center gap-3">
          <p className="text-center text-xs uppercase tracking-wider text-muted-foreground">
            {t("otpPrompt")}
          </p>
          <InputOTP
            maxLength={6}
            value={otp}
            onChange={(value) => setOtp(value)}
            autoComplete="one-time-code"
            inputMode="numeric"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <Button
            type="submit"
            disabled={isVerifying || otp.length !== 6 || !email}
            className="w-full"
          >
            {isVerifying ? t("verifying") : t("verify")}
          </Button>
          {otpErrorCode && (
            <p className="text-sm text-destructive">{t(`errors.${otpErrorCode}`)}</p>
          )}
        </form>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("or")}</span>
          <Separator className="flex-1" />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onResend}
            disabled={isResending || !email}
            className="w-full"
          >
            {isResending ? t("resending") : t("resend")}
          </Button>
          {resendMessage && (
            <p
              className={
                resendMessage.tone === "error" ? "text-sm text-destructive" : "text-sm text-primary"
              }
            >
              {resendMessage.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
