"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"

// Surfaces when an admin lands on /account because /admin/** soft-walled
// them, OR when the live enforcement query says they're overdue. Reads from
// `?totpRequired=1` for first-paint immediacy and from the live tRPC query
// for the "you've been overdue N days" copy.
//
// Drops the `totpRequired` query param after first paint so a plain refresh
// of /account doesn't keep claiming "redirected from /admin"; the live
// enforcement query is the durable source of truth after the initial mount.
export function AdminTotpBanner() {
  const t = useTranslations("account.adminTotp")
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const fromRedirect = params.get("totpRequired") === "1"
  const enforcement = trpc.auth.totp.adminEnforcement.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  // Drop the `totpRequired` key after first paint so a refresh of /account
  // doesn't keep claiming "redirected from /admin"; the live enforcement
  // query is the durable source of truth from then on. The ref guard
  // keeps the cleanup single-shot, and the params string is a primitive
  // (not the URLSearchParams object) so the deps array stays stable
  // between renders and across HMR.
  //
  // Same one-shot path also fires the "admin restricted" toast : the
  // banner alone was easy to miss when the user landed on
  // `/account/security` and started looking at the TOTP card straight
  // away, so we surface a transient sonner that names the redirect
  // reason.
  const cleanedRef = useRef(false)
  const paramsStr = params.toString()
  useEffect(() => {
    if (!fromRedirect || cleanedRef.current) return
    cleanedRef.current = true
    toast.error(t("redirectToastTitle"), {
      description: t("redirectToastSubtitle"),
      duration: 6000,
    })
    const next = new URLSearchParams(paramsStr)
    next.delete("totpRequired")
    const query = next.toString()
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false })
  }, [fromRedirect, paramsStr, pathname, router, t])

  if (!enforcement.data?.required && !fromRedirect) return null

  const mode = enforcement.data?.required ? enforcement.data.mode : "soft"
  const daysOverdue = enforcement.data?.required ? enforcement.data.daysOverdue : 0

  return (
    <div
      className={`mb-6 rounded-lg border p-4 ${
        mode === "hard"
          ? "border-destructive/50 bg-destructive/5"
          : "border-amber-400/50 bg-amber-400/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            mode === "hard" ? "text-destructive" : "text-amber-500"
          }`}
          aria-hidden
        />
        <div className="space-y-1">
          <p
            className={`text-sm font-semibold ${
              mode === "hard" ? "text-destructive" : "text-amber-500"
            }`}
          >
            {mode === "hard" ? t("hardTitle") : t("softTitle")}
          </p>
          <p className="text-sm text-muted-foreground">
            {mode === "hard"
              ? t("hardSubtitle", { days: daysOverdue })
              : t("softSubtitle")}
          </p>
        </div>
      </div>
    </div>
  )
}
