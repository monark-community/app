"use client"

import { useTranslations } from "next-intl"
import { listFlagKeys } from "@monark/feature-flags/contracts"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { CollapsibleSection } from "../collapsible-section"

const KEYS = listFlagKeys()

export function FeatureFlagsPanel() {
  const t = useTranslations("devOverlay")
  const { data, isLoading, error, refetch, isFetching } =
    trpc.featureFlags.getMany.useQuery(
      { keys: KEYS, scope: {} },
      { refetchOnWindowFocus: false },
    )

  const onCount = data ? KEYS.filter((k) => data[k]).length : 0
  const badge = data ? (
    <span className="rounded-full bg-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {t("badges.flagsOn", { on: onCount, total: KEYS.length })}
    </span>
  ) : null

  return (
    <CollapsibleSection title={t("sections.featureFlags")} badge={badge}>
      <div className="space-y-3">
        {isLoading && <p className="text-xs opacity-60">{t("featureFlags.resolving")}</p>}
        {error && (
          <p className="text-xs text-red-400">
            {t("errorPrefix")} <span className="font-mono">{error.message}</span>
          </p>
        )}
        {data && (
          <ul className="space-y-1 text-xs font-mono">
            {KEYS.map((key) => (
              <li key={key} className="flex items-center justify-between gap-3">
                <span className="truncate">{key}</span>
                <span className={data[key] ? "text-emerald-400" : "text-muted-foreground"}>
                  {data[key] ? t("featureFlags.on") : t("featureFlags.off")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-muted-foreground">{t("featureFlags.scopeNote")}</p>
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
