"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { CollapsibleSection } from "../collapsible-section"

export function ApiHealthPanel() {
  const t = useTranslations("devOverlay")
  const { data, isLoading, error, refetch, isFetching } = trpc.auth.ping.useQuery(
    undefined,
    { refetchOnWindowFocus: false },
  )

  const badge = error ? (
    <span className="rounded-full bg-red-400/20 px-1.5 py-0.5 font-mono text-[10px] text-red-400">
      {t("badges.down")}
    </span>
  ) : data ? (
    <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
      {t("badges.up")}
    </span>
  ) : null

  return (
    <CollapsibleSection title={t("sections.apiHealth")} badge={badge}>
      <div className="space-y-2">
        {isLoading && <p className="text-xs opacity-60">{t("apiHealth.pinging")}</p>}
        {error && (
          <p className="text-xs text-red-400">
            {t("errorPrefix")} <span className="font-mono">{error.message}</span>
          </p>
        )}
        {data && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
            <dt className="text-muted-foreground">{t("apiHealth.fields.pong")}</dt>
            <dd>{String(data.pong)}</dd>
            <dt className="text-muted-foreground">{t("apiHealth.fields.at")}</dt>
            <dd className="truncate">{data.at}</dd>
          </dl>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {isFetching ? "…" : t("refetch")}
        </Button>
      </div>
    </CollapsibleSection>
  )
}
