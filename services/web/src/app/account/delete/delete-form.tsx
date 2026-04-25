"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  requestAccountDeletionAction,
  type DeleteAccountErrorCode,
} from "../actions"

export function DeleteForm({ email }: { email: string }) {
  const t = useTranslations("account.delete")
  const router = useRouter()
  const [confirmation, setConfirmation] = useState("")
  const [errorCode, setErrorCode] = useState<DeleteAccountErrorCode | null>(null)
  const [isPending, startTransition] = useTransition()

  const canSubmit =
    confirmation.trim().toLowerCase() === email.toLowerCase() && !isPending

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorCode(null)
    startTransition(async () => {
      const result = await requestAccountDeletionAction({
        emailConfirmation: confirmation,
      })
      if (!result.ok) {
        setErrorCode(result.errorCode)
        return
      }
      const when = encodeURIComponent(result.deletionCompletesAt)
      router.push(`/signin?deletionScheduledAt=${when}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="confirmation">
          {t("confirmPrompt", { email })}
        </Label>
        <Input
          id="confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={email}
          autoComplete="off"
        />
      </div>
      {errorCode && (
        <p className="text-sm text-destructive">{t(`errors.${errorCode}`)}</p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="destructive"
          disabled={!canSubmit}
        >
          {isPending ? t("submitting") : t("submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/account")}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  )
}
