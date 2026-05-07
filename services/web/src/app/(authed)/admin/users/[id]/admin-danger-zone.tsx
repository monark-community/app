"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Trash2 } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { DangerCard, DangerRow } from "@/components/danger-card"
import { trpc } from "@/lib/trpc"

function formatDate(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString([locale, "en"], {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

type Props = {
  userId: string
  email: string
  deletedAt: Date | string | null
}

/**
 * Two destructive admin actions, gated by the same `<DangerCard>` :
 *
 *  - **Request deletion** : routes through the standard 14-day
 *    grace flow (`users.adminRequestDeletion`). The user's row gets
 *    `deletedAt` stamped ; the daily cron hard-deletes after the
 *    window. Reversible until the cron fires via the Cancel button
 *    that appears on the same surface once the row is in grace.
 *  - **Delete permanently** : skips the grace window entirely and
 *    runs `auth.adminHardDeleteUser` ; the row is anonymized + the
 *    Supabase auth user is removed in one shot. Typed-email
 *    confirmation matches the self-service dialog so the operator
 *    can't fat-finger an irreversible action.
 *
 * Self-target is blocked by both procedures ; the operator's own
 * deletion lives on `/account` where the post-delete sign-out flow
 * is wired correctly.
 *
 * When the row is already in grace, the surface flips to a warning
 * card with the cancel-deletion affordance (still bordered, still
 * visually distinct, but amber instead of red).
 */
export function AdminDangerZone({ userId, email, deletedAt }: Props) {
  const t = useTranslations("admin.users.dangerZone")
  const locale = useLocale()
  const router = useRouter()
  const utils = trpc.useUtils()

  const inGrace = Boolean(deletedAt)
  const completesAtIso = deletedAt
    ? new Date(
        new Date(deletedAt).getTime() + 14 * 24 * 60 * 60 * 1000,
      ).toISOString()
    : null

  const requestDeletion = trpc.users.adminRequestDeletion.useMutation({
    onSuccess: () => {
      void utils.users.adminGetUser.invalidate({ userId })
      toast.success(t("requestSuccess"))
      setRequestOpen(false)
    },
    onError: (error) => {
      toast.error(error.message || t("requestError"))
    },
  })

  const cancelDeletion = trpc.users.adminCancelDeletion.useMutation({
    onSuccess: () => {
      void utils.users.adminGetUser.invalidate({ userId })
      toast.success(t("cancelSuccess"))
    },
    onError: (error) => {
      toast.error(error.message || t("cancelError"))
    },
  })

  const hardDelete = trpc.auth.adminHardDeleteUser.useMutation({
    onSuccess: () => {
      toast.success(t("hardDeleteSuccess"))
      // List query is now stale ; the row is anonymized so listing it
      // again would surface noise. Bounce back to the list rather than
      // staying on a detail page that's about to render @monark.invalid.
      router.push("/admin/users")
    },
    onError: (error) => {
      toast.error(error.message || t("hardDeleteError"))
    },
  })

  const [requestOpen, setRequestOpen] = useState(false)
  const [hardOpen, setHardOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const emailMatches =
    confirmEmail.trim().toLowerCase() === email.trim().toLowerCase()

  if (inGrace && completesAtIso) {
    return (
      <DangerCard
        tone="warning"
        title={t("graceTitle")}
        subtitle={t("graceSubtitle", {
          date: formatDate(completesAtIso, locale),
        })}
      >
        <DangerRow
          title={t("cancelDeletion")}
          description={t("cancelDescription")}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => cancelDeletion.mutate({ userId })}
              disabled={cancelDeletion.isPending}
            >
              {cancelDeletion.isPending
                ? t("cancelPending")
                : t("cancelDeletion")}
            </Button>
          }
        />
      </DangerCard>
    )
  }

  return (
    <>
      <DangerCard title={t("title")} subtitle={t("subtitle")}>
        <DangerRow
          title={t("requestDeletion")}
          description={t("requestHint")}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestOpen(true)}
            >
              {t("requestDeletion")}
            </Button>
          }
        />
        <Separator />
        <DangerRow
          title={t("hardDelete")}
          description={t("hardDeleteHint")}
          action={
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setConfirmEmail("")
                setHardOpen(true)
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("hardDelete")}
            </Button>
          }
        />
      </DangerCard>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("requestDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("requestDialog.description", { email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestOpen(false)}
              disabled={requestDeletion.isPending}
            >
              {t("requestDialog.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => requestDeletion.mutate({ userId })}
              disabled={requestDeletion.isPending}
            >
              {requestDeletion.isPending
                ? t("requestDialog.confirming")
                : t("requestDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={hardOpen}
        onOpenChange={(next) => {
          setHardOpen(next)
          if (!next) setConfirmEmail("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t("hardDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {t("hardDialog.description", { email })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="hard-confirm-email">
              {t("hardDialog.label", { email })}
            </Label>
            <Input
              id="hard-confirm-email"
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              placeholder={email}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setHardOpen(false)}
              disabled={hardDelete.isPending}
            >
              {t("hardDialog.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => hardDelete.mutate({ userId })}
              disabled={!emailMatches || hardDelete.isPending}
            >
              {hardDelete.isPending
                ? t("hardDialog.confirming")
                : t("hardDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
