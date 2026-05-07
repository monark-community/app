"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { CollapsibleSection } from "../collapsible-section"

export function CurrentOrgPanel() {
  const t = useTranslations("devOverlay")
  const current = trpc.organizations.current.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const mine = trpc.organizations.mine.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  // `organizations.current` only resolves the org when the session
  // carries an `active_organization_id` claim ; in single-tenant
  // deploys (and in any deploy where the claim hasn't been persisted
  // yet) the call returns null even though the user clearly has a
  // working org. Fall back to the first membership so the dev panel
  // surfaces something useful instead of "(none)" — annotated below
  // so the operator can tell apart "claim resolved" from "inferred".
  const inferredOrg = current.data ?? mine.data?.[0] ?? null
  const inferredFromClaim = current.data !== null && current.data !== undefined

  const isFetching = current.isFetching || mine.isFetching
  const badge = inferredOrg ? (
    <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
      {inferredOrg.slug}
    </span>
  ) : null

  return (
    <CollapsibleSection title={t("sections.currentOrg")} badge={badge}>
      <div className="space-y-3">
        {current.isLoading && <p className="text-xs opacity-60">{t("currentOrg.resolving")}</p>}
        {current.error && (
          <p className="text-xs text-red-400">
            {t("errorPrefix")} <span className="font-mono">{current.error.message}</span>
          </p>
        )}
        {!current.isLoading && !current.error && !inferredOrg && (
          <p className="text-xs text-muted-foreground">{t("currentOrg.none")}</p>
        )}
        {inferredOrg && (
          <>
            {!inferredFromClaim && (
              <p className="text-[10px] uppercase tracking-wider text-amber-400/80">
                {t("currentOrg.inferred")}
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
              <dt className="text-muted-foreground">{t("currentOrg.fields.slug")}</dt>
              <dd className="truncate">{inferredOrg.slug}</dd>
              <dt className="text-muted-foreground">{t("currentOrg.fields.name")}</dt>
              <dd className="truncate">{inferredOrg.displayName}</dd>
              <dt className="text-muted-foreground">{t("currentOrg.fields.id")}</dt>
              <dd className="truncate">{inferredOrg.id}</dd>
            </dl>
          </>
        )}
        {mine.data && mine.data.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("currentOrg.memberships", { count: mine.data.length })}
            </p>
            <ul className="space-y-1 text-xs font-mono">
              {mine.data.map((org) => (
                <li key={org.id} className="flex items-center justify-between gap-3">
                  <span className="truncate">{org.slug}</span>
                  <span className="truncate text-muted-foreground">{org.displayName}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void current.refetch()
            void mine.refetch()
          }}
          disabled={isFetching}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {isFetching ? "…" : t("refetch")}
        </Button>
      </div>
    </CollapsibleSection>
  )
}
