"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrustedDeviceCard } from "@/components/trusted-device-card"
import { trpc } from "@/lib/trpc"

export function TrustedDevicesSection() {
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
          <p className="text-sm text-muted-foreground">{t("resolving")}</p>
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
