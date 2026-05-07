"use client"

import { useLocale, useTranslations } from "next-intl"
import { ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { trpc } from "@/lib/trpc"

function formatDate(iso: string | Date, locale: string): string {
  const parsed = typeof iso === "string" ? new Date(iso) : iso
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toLocaleDateString([locale, "en"], {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/**
 * Read-only roster of platform-tier `SYSADMIN` holders.
 *
 * Lives at the top of /admin/rbac so any operator with admin access
 * (org-tier admins included) can see who can override them. Edits
 * are intentionally absent from the UI — granting + revoking
 * SYSADMIN goes through `tools/sysadmin.ts` ; this card just
 * surfaces the roster so the existence of sysadmins isn't a hidden
 * detail.
 */
export function SystemAdminsCard() {
  const t = useTranslations("admin.rbac.sysadmins")
  const locale = useLocale()
  const query = trpc.rbac.adminListSysadmins.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
  })

  return (
    <Card className="bg-transparent shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-500" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(query.data ?? []).map((row) => {
              const label = row.user.displayName ?? row.user.email
              return (
                <li
                  key={row.assignmentId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  >
                    <ShieldCheck className="h-4 w-4 text-amber-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{label}</p>
                    {row.user.displayName && (
                      <p className="truncate text-xs text-muted-foreground">
                        {row.user.email}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {t("grantedAt", {
                      date: formatDate(row.grantedAt, locale),
                    })}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
