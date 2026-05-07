"use client"

import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { ArrowLeft, Clock, ShieldOff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { trpc } from "@/lib/trpc"
import { AdminAccountActions } from "./admin-account-actions"
import { AdminDangerZone } from "./admin-danger-zone"
import { AdminNotifications } from "./admin-notifications"
import { AdminProfileForm } from "./admin-profile-form"
import { AdminRoles } from "./admin-roles"

function formatDate(date: Date | string | null, locale: string): string {
  if (!date) return ""
  const parsed = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toLocaleDateString([locale, "en"], {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function UserDetail({ userId }: { userId: string }) {
  const t = useTranslations("admin.users.detail")
  const tBadges = useTranslations("admin.users.badges")
  const locale = useLocale()
  const query = trpc.users.adminGetUser.useQuery(
    { userId },
    { refetchOnWindowFocus: false },
  )

  return (
    <section className="space-y-4">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
      </div>

      {query.isLoading && (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("loadError")}
          </CardContent>
        </Card>
      )}

      {query.data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-auto text-xl font-semibold tracking-tight">
              {query.data.user.displayName ?? query.data.user.email}
            </h1>
            {query.data.user.disabledAt && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <ShieldOff className="h-3 w-3" aria-hidden />
                {tBadges("disabled")}
              </span>
            )}
            {query.data.user.deletedAt && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-2 py-0.5 text-xs text-amber-500">
                <Clock className="h-3 w-3" aria-hidden />
                {tBadges("pendingDeletion")}
              </span>
            )}
          </div>

          <AdminProfileForm user={query.data.user} />

          <Card className="bg-transparent shadow-none">
            <CardHeader>
              <CardTitle>{t("identity.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={t("identity.id")} value={query.data.user.id} />
              <Row label={t("identity.email")} value={query.data.user.email} />
              <Row
                label={t("identity.emailVerified")}
                value={
                  query.data.user.emailVerifiedAt
                    ? t("yes")
                    : t("no")
                }
              />
              <Row
                label={t("identity.createdAt")}
                value={formatDate(query.data.user.createdAt, locale)}
              />
              {query.data.user.deletedAt && (
                <Row
                  label={t("identity.deletedAt")}
                  value={formatDate(query.data.user.deletedAt, locale)}
                />
              )}
            </CardContent>
          </Card>

          <AdminRoles
            userId={query.data.user.id}
            assignments={query.data.assignments}
            disabled={Boolean(query.data.user.deletedAt)}
          />

          <AdminAccountActions
            userId={query.data.user.id}
            email={query.data.user.email}
            disabled={Boolean(query.data.user.deletedAt)}
          />

          <AdminNotifications
            userId={query.data.user.id}
            disabled={Boolean(query.data.user.deletedAt)}
          />

          <AdminDangerZone
            userId={query.data.user.id}
            email={query.data.user.email}
            deletedAt={query.data.user.deletedAt}
          />
        </>
      )}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium">{value}</span>
    </div>
  )
}
