"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { TrustedDeviceCard } from "@/components/trusted-device-card"
import { trpc } from "@/lib/trpc"
import { CollapsibleSection } from "../collapsible-section"

export function TrustedDevicesPanel() {
  const t = useTranslations("devOverlay")
  const utils = trpc.useUtils()
  const query = trpc.auth.trustedDevices.mine.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const revoke = trpc.auth.trustedDevices.revoke.useMutation({
    onSuccess: () => {
      void utils.auth.trustedDevices.mine.invalidate()
    },
  })

  const list = query.data ?? []
  const badge = (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
        list.length > 0
          ? "bg-emerald-400/20 text-emerald-400"
          : "bg-border text-muted-foreground"
      }`}
    >
      {t("trustedDevices.count", { count: list.length })}
    </span>
  )

  const cardLabels = {
    firstSeen: t("trustedDevices.fields.firstSeen"),
    lastSeen: t("trustedDevices.fields.lastSeen"),
    ip: t("trustedDevices.fields.ip"),
    totpVerified: t("trustedDevices.fields.totpVerified"),
  }

  return (
    <CollapsibleSection title={t("sections.trustedDevices")} badge={badge}>
      <div className="space-y-3">
        {query.isLoading && (
          <p className="text-xs opacity-60">{t("trustedDevices.resolving")}</p>
        )}
        {query.error && (
          <p className="text-xs text-red-400">
            {t("errorPrefix")}{" "}
            <span className="font-mono">{query.error.message}</span>
          </p>
        )}
        {!query.isLoading && !query.error && list.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("trustedDevices.none")}
          </p>
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
                totpVerifiedAt={device.totpVerifiedAt}
                onRevoke={() => revoke.mutate({ deviceId: device.id })}
                revokePending={revoke.isPending}
                revokeLabel={t("trustedDevices.revoke")}
                size="compact"
                labels={cardLabels}
              />
            ))}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {query.isFetching ? "…" : t("refetch")}
        </Button>
      </div>
    </CollapsibleSection>
  )
}
