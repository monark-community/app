"use client"

import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { trpc } from "@/lib/trpc"
import { cancelAccountDeletionAction } from "./actions"
import { DeleteAccountDialog } from "./delete-account-dialog"

// Date is shown to the user in their app-preference locale ; the
// previous version called `toLocaleDateString(undefined, …)` which
// uses the runtime / browser default rather than the user's stored
// preference. Fallback array `[locale, "en"]` so an unrecognised
// locale resolves to English instead of throwing.
function formatCompletesAt(iso: string, locale: string): string {
  const parsed = new Date(iso)
  return parsed.toLocaleDateString([locale, "en"], {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function DangerZoneSection() {
  const t = useTranslations("account.danger")
  const locale = useLocale()
  const router = useRouter()
  const utils = trpc.useUtils()
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false })
  const [, startTransition] = useTransition()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const deletedAt = me.data?.deletedAt ?? null
  const email = me.data?.email ?? ""

  function onCancelDeletion() {
    startTransition(async () => {
      const result = await cancelAccountDeletionAction()
      if (result.ok) {
        toast.success(t("cancelSuccess"))
      } else {
        toast.error(t("cancelError"))
      }
      await utils.users.me.invalidate()
      router.refresh()
    })
  }

  if (deletedAt) {
    const completesAt = new Date(
      new Date(deletedAt).getTime() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString()
    return (
      <Card className="border-amber-400/50 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle className="text-amber-500">{t("graceTitle")}</CardTitle>
          <CardDescription>
            {t("graceSubtitle", { date: formatCompletesAt(completesAt, locale) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={onCancelDeletion}>
            {t("cancelDeletion")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="bg-transparent shadow-none">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!email}
          >
            {t("deleteAccount")}
          </Button>
        </CardContent>
      </Card>
      {email && (
        <DeleteAccountDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          email={email}
        />
      )}
    </>
  )
}
