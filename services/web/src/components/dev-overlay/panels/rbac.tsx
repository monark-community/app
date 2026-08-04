"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CollapsibleSection } from "../collapsible-section";

export function RbacPanel() {
  const t = useTranslations("devOverlay");
  const roles = trpc.rbac.myRoles.useQuery(undefined, { refetchOnWindowFocus: false });
  const perms = trpc.rbac.myPermissions.useQuery(undefined, { refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState("");

  const toggleSysadmin = trpc.rbac.devToggleSysadmin.useMutation({
    onSuccess: () => {
      void utils.rbac.myRoles.invalidate();
      void utils.rbac.myPermissions.invalidate();
      void utils.rbac.isAdmin.invalidate();
      void utils.rbac.isSysadmin.invalidate();
    },
  });

  const isFetching = roles.isFetching || perms.isFetching;
  const dash = t("rbac.dash");
  const roleNames = (roles.data ?? []).map((r) => r.name);
  const isSysadmin = (roles.data ?? []).some((r) => r.key === "SYSADMIN");

  const badge =
    roleNames.length > 0 ? (
      <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
        {roleNames[0]!.toLowerCase()}
      </span>
    ) : null;

  return (
    <CollapsibleSection title={t("sections.rbac")} badge={badge}>
      <div className="space-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
          <dt className="text-muted-foreground">{t("rbac.fields.roles")}</dt>
          <dd className="truncate">{roleNames.length > 0 ? roleNames.join(", ") : dash}</dd>
        </dl>

        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("rbac.permissions", { count: perms.data?.length ?? 0 })}
          </p>
          {perms.data && perms.data.length > 0 ? (
            <>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("rbac.filterPlaceholder")}
                aria-label={t("rbac.filterPlaceholder")}
                className="mb-1.5 h-7 w-full rounded-md border border-input bg-background px-2 text-[11px]"
              />
              <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] font-mono">
                {perms.data
                  .filter((p) => p.toLowerCase().includes(filter.toLowerCase()))
                  .map((p) => (
                    <li key={p} className="text-emerald-400">
                      {p}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t("rbac.noneGranted")}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleSysadmin.mutate()}
            disabled={toggleSysadmin.isPending || roles.isLoading}
            className={`h-7 px-2 text-xs ${isSysadmin ? "border-amber-500/40 text-amber-400 hover:border-amber-500 hover:text-amber-300" : "border-emerald-500/40 text-emerald-400 hover:border-emerald-500 hover:text-emerald-300"}`}
          >
            {toggleSysadmin.isPending
              ? "…"
              : isSysadmin
                ? "Demote from Sysadmin"
                : "Promote to Sysadmin"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void roles.refetch();
              void perms.refetch();
            }}
            disabled={isFetching}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {isFetching ? "…" : t("refetch")}
          </Button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
