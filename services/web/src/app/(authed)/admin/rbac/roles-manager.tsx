"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronRight, Lock, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { RoleChip } from "@/components/role-chip"
import { trpc } from "@/lib/trpc"

const ADMIN_ROLE_KEY = "ADMIN"

/**
 * Per-org role list with a name search + clickable role rows that
 * navigate to the role detail page (`/admin/rbac/roles/[id]`). The
 * "New role" CTA links to `/admin/rbac/roles/new?org=<orgId>` so the
 * page knows which org to scope the create against.
 *
 * In single-tenant deploys the org picker collapses (the
 * `bootstrapStatus.singletonOrganizationId` resolves the only
 * possible target). Built-in `ADMIN` always appears at the top of
 * the list ; custom roles sit below.
 */
export function RolesManager() {
  const t = useTranslations("admin.rbac.manager")

  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const isSingleTenant = status.data?.mode !== "multi"
  const singletonId = status.data?.singletonOrganizationId ?? null

  const orgsQuery = trpc.organizations.adminList.useQuery(
    { limit: 100 },
    {
      enabled: !isSingleTenant,
      refetchOnWindowFocus: false,
    },
  )

  const [selectedOrgId, setSelectedOrgId] = useState("")
  // Single-tenant : pin to the singleton automatically.
  useEffect(() => {
    if (isSingleTenant && singletonId) setSelectedOrgId(singletonId)
  }, [isSingleTenant, singletonId])
  // Multi-tenant : when the orgs list resolves, default to the first
  // entry so the manager is immediately useful.
  useEffect(() => {
    if (selectedOrgId !== "") return
    if (isSingleTenant) return
    const first = orgsQuery.data?.items[0]
    if (first) setSelectedOrgId(first.id)
  }, [isSingleTenant, orgsQuery.data, selectedOrgId])

  const rolesQuery = trpc.rbac.adminListRoles.useQuery(
    { organizationId: selectedOrgId },
    { enabled: selectedOrgId !== "", refetchOnWindowFocus: false },
  )

  // Search filters the list client-side : the result set is small
  // (a handful of rows per org) so a debounced server search would
  // be over-engineered. Case-insensitive match against name + key.
  const [search, setSearch] = useState("")
  const trimmedSearch = search.trim().toLowerCase()
  const orgs = orgsQuery.data?.items ?? []
  const allRoles = rolesQuery.data ?? []
  const visibleRoles = useMemo(() => {
    if (trimmedSearch === "") return allRoles
    return allRoles.filter(
      (role) =>
        role.name.toLowerCase().includes(trimmedSearch) ||
        role.key.toLowerCase().includes(trimmedSearch),
    )
  }, [allRoles, trimmedSearch])
  const showOrgPicker = !isSingleTenant && orgs.length > 0

  return (
    <div className="space-y-4">
      {showOrgPicker && (
        <Card className="bg-transparent shadow-none">
          <CardHeader>
            <CardTitle>{t("orgPicker.title")}</CardTitle>
            <CardDescription>{t("orgPicker.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("orgPicker.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">{t("listSubtitle")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
            className="pl-9"
          />
        </div>
        <Button
          asChild
          type="button"
          size="sm"
          disabled={selectedOrgId === ""}
        >
          <Link
            href={
              selectedOrgId
                ? `/admin/rbac/roles/new?org=${encodeURIComponent(selectedOrgId)}`
                : "/admin/rbac"
            }
            aria-disabled={selectedOrgId === "" ? "true" : undefined}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("createCta")}
          </Link>
        </Button>
      </div>

      {rolesQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : visibleRoles.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {trimmedSearch !== ""
            ? t("emptySearch", { query: search.trim() })
            : t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {visibleRoles.map((role) => {
            const isBuiltInAdmin =
              role.builtIn && role.key === ADMIN_ROLE_KEY
            return (
              <li key={role.id}>
                <Link
                  href={`/admin/rbac/roles/${role.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <RoleChip name={role.name} color={role.color} />
                      {role.builtIn && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <Lock className="h-3 w-3" aria-hidden />
                          {t("badges.builtIn")}
                        </span>
                      )}
                      {isBuiltInAdmin && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {t("badges.allPermissions")}
                        </span>
                      )}
                    </div>
                    {role.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
