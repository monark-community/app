"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  requestPasswordResetAction,
  verifyRecoveryOtpAction,
  type VerifyRecoveryOtpErrorCode,
} from "./actions"

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword")
  const [email, setEmail] = useState("")
  // After the email is submitted we keep the same form mounted but switch
  // its mode ; the submitted email is still in `email` state and we
  // need it as context for the OTP-verify call.
  const [submitted, setSubmitted] = useState(false)
  const [otp, setOtp] = useState("")
  const [otpErrorCode, setOtpErrorCode] = useState<VerifyRecoveryOtpErrorCode | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isVerifying, startVerify] = useTransition()
  const [isResending, startResend] = useTransition()

  function onSubmitEmail(formData: FormData) {
    const value = String(formData.get("email") ?? "").trim()
    setEmail(value)
    startTransition(async () => {
      await requestPasswordResetAction({ email: value })
      setSubmitted(true)
    })
  }

  function onVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (otp.length !== 6 || !email) return
    setOtpErrorCode(null)
    startVerify(async () => {
      const result = await verifyRecoveryOtpAction({ email, token: otp })
      if (result && !result.ok) setOtpErrorCode(result.errorCode)
      // On success the action redirects ; nothing to do here.
    })
  }

  function onResend() {
    if (!email) return
    startResend(async () => {
      await requestPasswordResetAction({ email })
    })
  }

  if (submitted) {
    return (
      <Card className="shadow-none border-border">
        <CardContent className="flex flex-col gap-5 pt-6">
          <p className="text-sm text-muted-foreground">
            {t("sentBody", { email })}
          </p>

          <form onSubmit={onVerifyOtp} className="flex flex-col items-center gap-3">
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
              disabled={isVerifying || otp.length !== 6}
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
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("or")}
            </span>
            <Separator className="flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onResend}
            disabled={isResending}
            className="w-full"
          >
            {isResending ? t("submitting") : t("resend")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-none border-border">
      <CardContent className="pt-6">
        <form action={onSubmitEmail} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t("labels.email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
