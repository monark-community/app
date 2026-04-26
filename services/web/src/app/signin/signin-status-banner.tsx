"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2, Clock } from "lucide-react"

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// Surfaces inline confirmation when the user lands on /signin from a
// completed flow (email change confirmed, account deletion scheduled).
// Both flows force sign-out, so the user lands here without any session;
// the banner explains *why* they're back at /signin.
export function SignInStatusBanner() {
  const t = useTranslations("auth.signIn.banners")
  const params = useSearchParams()

  const emailChanged = params.get("emailChanged") === "1"
  const deletionScheduledAt = params.get("deletionScheduledAt")

  if (emailChanged) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("emailChanged.title")}</p>
          <p className="text-xs text-muted-foreground">{t("emailChanged.subtitle")}</p>
        </div>
      </div>
    )
  }

  if (deletionScheduledAt) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-amber-500">
            {t("deletionScheduled.title")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("deletionScheduled.subtitle", {
              date: formatDate(deletionScheduledAt),
            })}
          </p>
        </div>
      </div>
    )
  }

  return null
}
