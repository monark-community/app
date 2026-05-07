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
  verifyTotpChallengeAction,
  type TotpChallengeErrorCode,
} from "./actions"

export function TotpForm() {
  const t = useTranslations("auth.totpChallenge")
  const [mode, setMode] = useState<"totp" | "recovery">("totp")
  const [code, setCode] = useState("")
  const [errorCode, setErrorCode] = useState<TotpChallengeErrorCode | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorCode(null)
    startTransition(async () => {
      const result = await verifyTotpChallengeAction({
        code: code.trim(),
        mode,
      })
      if (result && !result.ok) setErrorCode(result.errorCode)
    })
  }

  return (
    <Card className="shadow-none border-border">
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "totp" ? (
            <div className="flex flex-col items-center gap-2">
              <Label htmlFor="code" className="self-start">
                {t("labels.code")}
              </Label>
              <InputOTP
                id="code"
                maxLength={6}
                value={code}
                onChange={(value) => setCode(value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
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
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="code">{t("labels.recoveryCode")}</Label>
              {/* Recovery codes are 14 chars (XXXX-XXXX-XXXX) ; the
                  6-slot OTP component can't represent that shape, so
                  this branch keeps a regular Input. */}
              <Input
                id="code"
                name="code"
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="XXXX-XXXX-XXXX"
                maxLength={14}
                autoFocus
              />
            </div>
          )}
          {errorCode && (
            <p className="text-sm text-destructive">{t(`errors.${errorCode}`)}</p>
          )}
          <Button
            type="submit"
            disabled={
              isPending ||
              (mode === "totp" ? code.length < 6 : code.length === 0)
            }
            className="w-full"
          >
            {isPending ? t("submitting") : t("submit")}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("or")}
          </span>
          <Separator className="flex-1" />
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setMode((current) => (current === "totp" ? "recovery" : "totp"))
            setCode("")
            setErrorCode(null)
          }}
          className="w-full text-sm text-muted-foreground"
        >
          {mode === "totp" ? t("useRecoveryCode") : t("useTotp")}
        </Button>
      </CardContent>
    </Card>
  )
}
