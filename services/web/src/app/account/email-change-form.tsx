"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestEmailChangeAction } from "./actions"

export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations("account.emailChange")
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [isPending, startTransition] = useTransition()

  function reset() {
    setNewEmail("")
    setCurrentPassword("")
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = await requestEmailChangeAction({
        newEmail,
        currentPassword,
      })
      if (result.ok) {
        toast.success(t("sent"), {
          description: t("sentHint", { email: currentEmail }),
          duration: 8000,
        })
        reset()
        setOpen(false)
      } else {
        toast.error(t(`errors.${result.errorCode}`))
      }
    })
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {t("change")}
      </Button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border p-3">
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
        <Label htmlFor="currentPasswordForEmail">{t("labels.currentPassword")}</Label>
        <Input
          id="currentPasswordForEmail"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? t("submitting") : t("submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset()
            setOpen(false)
          }}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  )
}
