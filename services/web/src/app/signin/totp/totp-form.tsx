"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
          <div className="grid gap-2">
            <Label htmlFor="code">
              {mode === "totp" ? t("labels.code") : t("labels.recoveryCode")}
            </Label>
            <Input
              id="code"
              name="code"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              inputMode={mode === "totp" ? "numeric" : "text"}
              autoComplete="one-time-code"
              placeholder={
                mode === "totp" ? "000000" : "XXXX-XXXX-XXXX"
              }
              maxLength={mode === "totp" ? 6 : 14}
              autoFocus
            />
          </div>
          {errorCode && (
            <p className="text-sm text-destructive">{t(`errors.${errorCode}`)}</p>
          )}
          <Button type="submit" disabled={isPending} className="w-full">
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
