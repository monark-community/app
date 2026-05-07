"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { TrustedDeviceCard } from "@/components/trusted-device-card"
import { trpc } from "@/lib/trpc"
import {
  revokeAllAndSignOutAction,
  revokeCurrentDeviceAndSignOutAction,
} from "./actions"

export function TrustedDevicesSection({
  currentDeviceId,
}: {
  currentDeviceId: string | null
}) {
  const t = useTranslations("account.trustedDevices")
  const router = useRouter()
  const utils = trpc.useUtils()
  const query = trpc.auth.trustedDevices.mine.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const revoke = trpc.auth.trustedDevices.revoke.useMutation({
    onSuccess: () => void utils.auth.trustedDevices.mine.invalidate(),
  })

  // Confirm-dialog state. We open the dialog when the user clicks revoke on
  // either the current device or the "revoke all" button ; both paths sign
  // the user out, so a single dialog with mode-dependent copy is enough.
  const [confirm, setConfirm] = useState<
    | { mode: "current"; deviceId: string }
    | { mode: "all" }
    | null
  >(null)
  const [isPending, startTransition] = useTransition()

  const list = query.data ?? []
  const labels = {
    firstSeen: t("fields.firstSeen"),
    lastSeen: t("fields.lastSeen"),
    ip: t("fields.ip"),
    location: t("fields.location"),
    localDev: t("fields.localDev"),
    device: t("fields.device"),
    totpVerified: t("fields.totpVerified"),
    current: t("current"),
  }

  function onRevokeClick(deviceId: string) {
    if (deviceId === currentDeviceId) {
      setConfirm({ mode: "current", deviceId })
      return
    }
    revoke.mutate({ deviceId })
  }

  function onConfirm() {
    if (!confirm) return
    startTransition(async () => {
      const result =
        confirm.mode === "current"
          ? await revokeCurrentDeviceAndSignOutAction({ deviceId: confirm.deviceId })
          : await revokeAllAndSignOutAction()
      setConfirm(null)
      if (result.ok) {
        // Cache is gone with the session ; reset before navigating so we
        // don't flash stale "trusted devices" data on the way to /signin.
        utils.invalidate()
        router.replace("/signin")
        router.refresh()
      }
    })
  }

  const dialogCopy =
    confirm?.mode === "all"
      ? {
          title: t("revokeAllDialog.title"),
          description: t("revokeAllDialog.description"),
          confirm: t("revokeAllDialog.confirm"),
        }
      : {
          title: t("revokeCurrentDialog.title"),
          description: t("revokeCurrentDialog.description"),
          confirm: t("revokeCurrentDialog.confirm"),
        }

  return (
    <Card className="bg-transparent shadow-none">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && (
          <div className="space-y-2" aria-busy="true" aria-label={t("resolving")}>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border p-4"
              >
                <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!query.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        )}
        {list.length > 0 && (
          <div className="space-y-2">
            {list.map((device) => {
              // Format the title in the user's locale instead of trusting
              // the English-only `device.label` baked at insert time. When
              // the UA parser failed both browser + os, fall back to the
              // localized "Unknown device" string.
              const localizedLabel =
                device.browserName && device.osName
                  ? t("deviceTitle", {
                      browser: device.browserName,
                      os: device.osName,
                    })
                  : device.browserName ?? device.osName ?? t("deviceUnknown")
              return (
                <TrustedDeviceCard
                  key={device.id}
                  label={localizedLabel}
                  userAgent={device.userAgent}
                  deviceType={device.deviceType}
                  deviceVendor={device.deviceVendor}
                  deviceModel={device.deviceModel}
                  firstSeenAt={device.firstSeenAt}
                  lastSeenAt={device.lastSeenAt}
                  lastSeenIp={device.lastSeenIp}
                  country={device.country}
                  isCurrent={device.id === currentDeviceId}
                  onRevoke={() => onRevokeClick(device.id)}
                  revokePending={revoke.isPending}
                  revokeLabel={t("revoke")}
                  labels={labels}
                />
              )
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? "…" : t("refresh")}
          </Button>
          {list.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirm({ mode: "all" })}
              disabled={isPending}
              className="ml-auto text-destructive hover:text-destructive"
            >
              <ShieldOff className="mr-1 h-3 w-3" aria-hidden />
              {t("revokeAll")}
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setConfirm(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogCopy.title}</DialogTitle>
            <DialogDescription>{dialogCopy.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirm(null)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={isPending}
            >
              {isPending ? "…" : dialogCopy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
