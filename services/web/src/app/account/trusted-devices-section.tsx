"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrustedDeviceCard } from "@/components/trusted-device-card"
import { trpc } from "@/lib/trpc"

export function TrustedDevicesSection({
  currentDeviceId,
}: {
  currentDeviceId: string | null
}) {
  const t = useTranslations("account.trustedDevices")
  const utils = trpc.useUtils()
  const query = trpc.auth.trustedDevices.mine.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const revoke = trpc.auth.trustedDevices.revoke.useMutation({
    onSuccess: () => void utils.auth.trustedDevices.mine.invalidate(),
  })

  const list = query.data ?? []
  const labels = {
    firstSeen: t("fields.firstSeen"),
    lastSeen: t("fields.lastSeen"),
    ip: t("fields.ip"),
    totpVerified: t("fields.totpVerified"),
    current: t("current"),
  }

  return (
    <Card>
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
            {list.map((device) => (
              <TrustedDeviceCard
                key={device.id}
                label={device.label}
                userAgent={device.userAgent}
                firstSeenAt={device.firstSeenAt}
                lastSeenAt={device.lastSeenAt}
                lastSeenIp={device.lastSeenIp}
                country={device.country}
                totpVerifiedAt={device.totpVerifiedAt}
                isCurrent={device.id === currentDeviceId}
                onRevoke={() => revoke.mutate({ deviceId: device.id })}
                revokePending={revoke.isPending}
                revokeLabel={t("revoke")}
                labels={labels}
              />
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? "…" : t("refresh")}
        </Button>
      </CardContent>
    </Card>
  )
}
