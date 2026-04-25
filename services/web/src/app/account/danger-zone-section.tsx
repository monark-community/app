"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { trpc } from "@/lib/trpc"
import { cancelAccountDeletionAction } from "./actions"

function formatCompletesAt(iso: string): string {
  const parsed = new Date(iso)
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function DangerZoneSection() {
  const t = useTranslations("account.danger")
  const router = useRouter()
  const utils = trpc.useUtils()
  const me = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false })
  const [, startTransition] = useTransition()

  const deletedAt = me.data?.deletedAt ?? null

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
      <Card className="border-amber-400/50">
        <CardHeader>
          <CardTitle className="text-amber-500">{t("graceTitle")}</CardTitle>
          <CardDescription>
            {t("graceSubtitle", { date: formatCompletesAt(completesAt) })}
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
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="ghost" className="text-destructive hover:text-destructive">
          <Link href="/account/delete">{t("deleteAccount")}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
