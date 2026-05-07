"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { trpc } from "@/lib/trpc"
import { CollapsibleSection } from "../collapsible-section"

export function RbacPanel() {
  const t = useTranslations("devOverlay")
  // `myRoles` returns `Role` rows (id/key/name/builtIn/...) since the
  // RBAC table-driven migration. The dev overlay doesn't need rank
  // information ; it just shows what the current user holds.
  const roles = trpc.rbac.myRoles.useQuery(undefined, { refetchOnWindowFocus: false })
  const perms = trpc.rbac.myPermissions.useQuery(undefined, { refetchOnWindowFocus: false })

  const isFetching = roles.isFetching || perms.isFetching
  const dash = t("rbac.dash")
  const roleNames = (roles.data ?? []).map((r) => r.name)
  const badge = roleNames.length > 0 ? (
    <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
      {roleNames[0]!.toLowerCase()}
    </span>
  ) : null

  return (
    <CollapsibleSection title={t("sections.rbac")} badge={badge}>
      <div className="space-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
          <dt className="text-muted-foreground">{t("rbac.fields.roles")}</dt>
          <dd className="truncate">
            {roleNames.length > 0 ? roleNames.join(", ") : dash}
          </dd>
        </dl>

        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("rbac.permissions", { count: perms.data?.length ?? 0 })}
          </p>
          {perms.data && perms.data.length > 0 ? (
            <ul className="space-y-0.5 text-[11px] font-mono">
              {perms.data.map((p) => (
                <li key={p} className="text-emerald-400">
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t("rbac.noneGranted")}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void roles.refetch()
            void perms.refetch()
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
