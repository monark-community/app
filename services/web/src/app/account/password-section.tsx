"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changePasswordAction } from "./actions"

export function PasswordSection() {
  const t = useTranslations("account.password")
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [mismatch, setMismatch] = useState(false)
  const [isPending, startTransition] = useTransition()

  function resetForm() {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setMismatch(false)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    startTransition(async () => {
      const result = await changePasswordAction({ currentPassword, newPassword })
      if (result.ok) {
        toast.success(t("success"))
        resetForm()
        setOpen(false)
      } else {
        toast.error(t(`errors.${result.errorCode}`))
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!open && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
          >
            {t("change")}
          </Button>
        )}
        {open && (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="currentPassword">{t("labels.current")}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="newPassword">{t("labels.new")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">{t("minLengthHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">{t("labels.confirm")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                autoComplete="new-password"
              />
              {mismatch && (
                <p className="text-xs text-destructive">{t("errors.mismatch")}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? t("submitting") : t("submit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  resetForm()
                  setOpen(false)
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
