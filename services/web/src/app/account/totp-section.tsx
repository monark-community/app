"use client"

import Image from "next/image"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { trpc } from "@/lib/trpc"

type Enrollment = { secret: string; qrDataUrl: string }

export function TotpSection() {
  const t = useTranslations("account.totp")
  const utils = trpc.useUtils()
  const status = trpc.auth.totp.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const beginEnrollment = trpc.auth.totp.beginEnrollment.useMutation()
  const confirmEnrollment = trpc.auth.totp.confirmEnrollment.useMutation({
    onSuccess: () => void utils.auth.totp.status.invalidate(),
  })
  const disable = trpc.auth.totp.disable.useMutation({
    onSuccess: () => void utils.auth.totp.status.invalidate(),
  })
  const regenerate = trpc.auth.totp.regenerateRecoveryCodes.useMutation()

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [enrollCode, setEnrollCode] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [manageMode, setManageMode] = useState<"idle" | "disable" | "regenerate">("idle")
  const [manageCode, setManageCode] = useState("")

  const data = status.data
  const enrolled = Boolean(data && "enrolled" in data && data.enrolled)
  const active = enrolled && data && "activatedAt" in data && Boolean(data.activatedAt)

  async function onBegin() {
    setRecoveryCodes(null)
    const result = await beginEnrollment.mutateAsync()
    setEnrollment(result)
  }

  async function onConfirm() {
    setRecoveryCodes(null)
    try {
      const result = await confirmEnrollment.mutateAsync({ code: enrollCode.trim() })
      setRecoveryCodes(result.recoveryCodes)
      setEnrollment(null)
      setEnrollCode("")
      toast.success(t("enrolledSuccess"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.confirm"))
    }
  }

  async function onManage() {
    if (manageMode === "disable") {
      try {
        await disable.mutateAsync({ code: manageCode.trim() })
        setManageCode("")
        setManageMode("idle")
        toast.success(t("disabledSuccess"))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errors.disable"))
      }
    } else if (manageMode === "regenerate") {
      try {
        const result = await regenerate.mutateAsync({ code: manageCode.trim() })
        setRecoveryCodes(result.recoveryCodes)
        setManageCode("")
        setManageMode("idle")
        toast.success(t("regeneratedSuccess"))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errors.regenerate"))
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {active ? t("subtitleActive") : t("subtitleInactive")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!active && !enrollment && (
          <Button
            variant="outline"
            onClick={onBegin}
            disabled={beginEnrollment.isPending}
          >
            {beginEnrollment.isPending ? t("enrolling") : t("enroll")}
          </Button>
        )}

        {enrollment && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("scanQr")}</p>
            <div className="inline-block rounded border border-border bg-white p-3">
              <Image
                src={enrollment.qrDataUrl}
                alt="TOTP QR"
                width={200}
                height={200}
                unoptimized
              />
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {t("cantScan")}
              </summary>
              {/* Secret is an opaque base32 token; mono keeps it legible for
                  copy-paste. */}
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                {enrollment.secret}
              </p>
            </details>
            <div className="grid gap-2">
              <Label htmlFor="enrollCode">{t("enrollCodePrompt")}</Label>
              <Input
                id="enrollCode"
                value={enrollCode}
                onChange={(event) => setEnrollCode(event.target.value)}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onConfirm}
                disabled={confirmEnrollment.isPending || enrollCode.length < 6}
              >
                {confirmEnrollment.isPending ? t("confirming") : t("confirm")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEnrollment(null)
                  setEnrollCode("")
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}

        {recoveryCodes && (
          <div className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
            <p className="text-sm font-semibold text-amber-500">
              {t("saveRecovery")}
            </p>
            <p className="text-xs text-muted-foreground">{t("saveRecoveryHint")}</p>
            {/* Opaque recovery codes — mono helps users transcribe them
                accurately into a password manager. */}
            <ul className="grid grid-cols-2 gap-2 font-mono text-xs">
              {recoveryCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecoveryCodes(null)}
            >
              {t("ack")}
            </Button>
          </div>
        )}

        {active && !enrollment && (
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t("fields.recoveryRemaining")}</dt>
              <dd>
                {data && "remainingRecoveryCodes" in data
                  ? data.remainingRecoveryCodes
                  : "—"}
              </dd>
            </dl>

            {manageMode === "idle" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManageMode("regenerate")}
                >
                  {t("regenerate")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setManageMode("disable")}
                  className="text-destructive hover:text-destructive"
                >
                  {t("disable")}
                </Button>
              </div>
            )}

            {manageMode !== "idle" && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label htmlFor="manageCode">
                  {manageMode === "disable"
                    ? t("disablePrompt")
                    : t("regeneratePrompt")}
                </Label>
                <Input
                  id="manageCode"
                  value={manageCode}
                  onChange={(event) => setManageCode(event.target.value)}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={onManage}
                    disabled={
                      manageCode.length < 6 || disable.isPending || regenerate.isPending
                    }
                    variant={manageMode === "disable" ? "destructive" : "default"}
                  >
                    {manageMode === "disable" ? t("disable") : t("regenerate")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setManageMode("idle")
                      setManageCode("")
                    }}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
