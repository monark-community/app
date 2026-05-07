"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { TotpConfirmDialog } from "@/components/totp-confirm-dialog"
import { trpc } from "@/lib/trpc"
import {
  requestEmailChangeAction,
  verifyEmailChangeOtpAction,
  type ChangeEmailResult,
} from "./actions"

type Stage =
  | { kind: "form" }
  /**
   * Post-submit, awaiting confirmation. Stays mounted (instead of
   * snapping back to "form") so the user can paste the 6-digit code
   * from either inbox without re-entering email + password.
   */
  | { kind: "verify"; newEmail: string; pendingOtherSide: boolean }

/**
 * Email-change flow rendered inside a modal Dialog. The "Change
 * email" button on the account/security page is the trigger ; opening
 * the dialog mounts the form, submitting transitions to a `verify`
 * stage where the user pastes the 6-digit code from either inbox.
 *
 * State is wiped each time the dialog opens so a previous half-finished
 * attempt doesn't leak in. TOTP-enrolled users hit a sequential
 * `<TotpConfirmDialog>` between Submit and the request action ; the
 * server-side gate is what actually enforces this, the dialog is just
 * UX so the password-change-style modal lands on the same code path.
 */
export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations("account.emailChange")
  const router = useRouter()
  const totpStatus = trpc.auth.totp.status.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const totpEnrolled = Boolean(
    totpStatus.data && "enrolled" in totpStatus.data && totpStatus.data.enrolled,
  )

  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: "form" })
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [isSubmitting, startSubmit] = useTransition()
  const [isVerifying, startVerify] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogError, setDialogError] = useState<
    "invalidTotpCode" | "totpRequired" | null
  >(null)

  // Reset every time the dialog opens so a previous abandoned attempt
  // doesn't leak across opens. Closing the dialog mid-flow drops the
  // stage too.
  useEffect(() => {
    if (open) {
      setStage({ kind: "form" })
      setNewEmail("")
      setCurrentPassword("")
      setOtpCode("")
      setDialogError(null)
    }
  }, [open])

  function commitRequest(totpCode?: string) {
    startSubmit(async () => {
      const result: ChangeEmailResult = await requestEmailChangeAction({
        newEmail,
        currentPassword,
        totpCode,
      })
      if (result.ok) {
        toast.success(t("sent"), {
          description: t("sentHint", { email: currentEmail }),
          duration: 8000,
        })
        setStage({ kind: "verify", newEmail, pendingOtherSide: false })
        setCurrentPassword("")
        setDialogOpen(false)
        setDialogError(null)
        return
      }
      if (
        result.errorCode === "invalidTotpCode" ||
        result.errorCode === "totpRequired"
      ) {
        setDialogError(result.errorCode)
        return
      }
      toast.error(t(`errors.${result.errorCode}`))
      setDialogOpen(false)
      setDialogError(null)
    })
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (totpEnrolled) {
      setDialogError(null)
      setDialogOpen(true)
      return
    }
    commitRequest()
  }

  function onVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (stage.kind !== "verify" || otpCode.length !== 6) return
    startVerify(async () => {
      const result = await verifyEmailChangeOtpAction({
        newEmail: stage.newEmail,
        token: otpCode.trim(),
      })
      if (!result.ok) {
        toast.error(t(`errors.${result.errorCode}`))
        return
      }
      if (result.rotated) {
        router.replace("/signin?emailChanged=1")
        return
      }
      setStage({ ...stage, pendingOtherSide: true })
      setOtpCode("")
      toast.success(t("otpHalfDone"))
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {t("change")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogSubtitle")}</DialogDescription>
          </DialogHeader>

          {stage.kind === "form" && (
            <form
              id="email-change-form"
              onSubmit={onSubmit}
              className="grid gap-3 py-2"
            >
              <div className="grid gap-2">
                <Label htmlFor="newEmail">{t("labels.newEmail")}</Label>
                <Input
                  id="newEmail"
                  name="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currentPasswordForEmail">
                  {t("labels.currentPassword")}
                </Label>
                <Input
                  id="currentPasswordForEmail"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </form>
          )}

          {stage.kind === "verify" && (
            <form
              id="email-change-verify-form"
              onSubmit={onVerifyOtp}
              className="grid gap-3 py-2"
            >
              <p className="text-sm text-muted-foreground">
                {stage.pendingOtherSide
                  ? t("otpPendingOther", {
                      newEmail: stage.newEmail,
                      currentEmail,
                    })
                  : t("otpInstructions", {
                      newEmail: stage.newEmail,
                      currentEmail,
                    })}
              </p>
              <Label htmlFor="emailChangeOtp" className="text-sm">
                {t("otpPrompt")}
              </Label>
              <div className="flex justify-center">
                <InputOTP
                  id="emailChangeOtp"
                  maxLength={6}
                  value={otpCode}
                  onChange={(value) => setOtpCode(value)}
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
            </form>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting || isVerifying}
            >
              {t("close")}
            </Button>
            {stage.kind === "form" && (
              <Button
                type="submit"
                form="email-change-form"
                disabled={isSubmitting}
              >
                {isSubmitting ? t("submitting") : t("submit")}
              </Button>
            )}
            {stage.kind === "verify" && (
              <Button
                type="submit"
                form="email-change-verify-form"
                disabled={isVerifying || otpCode.length !== 6}
              >
                {isVerifying ? t("verifying") : t("verify")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TotpConfirmDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) setDialogError(null)
          setDialogOpen(next)
        }}
        onConfirm={async (code) => {
          setDialogError(null)
          commitRequest(code)
        }}
        scope="emailChange"
        errorKey={dialogError}
        pending={isSubmitting}
      />
    </>
  )
}
