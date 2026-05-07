"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronRight, Filter, Plus, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { trpc } from "@/lib/trpc"

const PLATFORM_VALUE = "__platform__"

type StatusFilter = "all" | "active" | "disabled" | "failing"

/**
 * Per-org list of webhook endpoints with a URL search + a status badge
 * column. Mirrors the `/admin/rbac` manager pattern : the org picker
 * collapses in single-tenant deploys, the list rows link into the
 * endpoint detail page, and a primary "New endpoint" CTA carries the
 * org id forward. Sysadmins also see a `Platform` slot in the picker
 * that lists endpoints with `organizationId = null` (no org scope).
 */
export function WebhooksManager() {
  const t = useTranslations("admin.webhooks.manager")

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

  // Picker value : `__platform__` for null-org endpoints, or an org id.
  const [selectedOrgValue, setSelectedOrgValue] = useState("")
  useEffect(() => {
    if (selectedOrgValue !== "") return
    if (isSingleTenant && singletonId) {
      setSelectedOrgValue(singletonId)
      return
    }
    const first = orgsQuery.data?.items[0]
    if (first) setSelectedOrgValue(first.id)
  }, [isSingleTenant, singletonId, orgsQuery.data, selectedOrgValue])

  const selectedOrgId =
    selectedOrgValue === PLATFORM_VALUE ? null : selectedOrgValue || null
  const showOrgPicker = !isSingleTenant && (orgsQuery.data?.items.length ?? 0) > 0

  const endpointsQuery = trpc.webhooks.list.useQuery(
    { organizationId: selectedOrgId },
    {
      enabled: selectedOrgValue !== "",
      refetchOnWindowFocus: false,
    },
  )

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const trimmedSearch = search.trim().toLowerCase()
  const allEndpoints = endpointsQuery.data ?? []
  const visibleEndpoints = useMemo(() => {
    return allEndpoints.filter((ep) => {
      // Status filter is applied first ; "failing" is the active rows
      // with a non-zero consecutive-failure counter, distinct from
      // operator-disabled rows.
      if (statusFilter === "active" && ep.status !== "active") return false
      if (statusFilter === "disabled" && ep.status !== "disabled") return false
      if (
        statusFilter === "failing" &&
        !(ep.status === "active" && ep.consecutiveFailures > 0)
      ) {
        return false
      }
      if (trimmedSearch === "") return true
      return (
        ep.name.toLowerCase().includes(trimmedSearch) ||
        ep.url.toLowerCase().includes(trimmedSearch) ||
        (ep.description?.toLowerCase().includes(trimmedSearch) ?? false)
      )
    })
  }, [allEndpoints, trimmedSearch, statusFilter])

  const newHref = (() => {
    if (selectedOrgValue === "") return "/admin/webhooks"
    if (selectedOrgValue === PLATFORM_VALUE) {
      return "/admin/webhooks/new?scope=platform"
    }
    return `/admin/webhooks/new?org=${encodeURIComponent(selectedOrgValue)}`
  })()

  return (
    <div className="space-y-4">
      {showOrgPicker && (
        <Card className="bg-transparent shadow-none">
          <CardHeader>
            <CardTitle>{t("orgPicker.title")}</CardTitle>
            <CardDescription>{t("orgPicker.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedOrgValue} onValueChange={setSelectedOrgValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("orgPicker.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PLATFORM_VALUE}>
                  {t("orgPicker.platform")}
                </SelectItem>
                {(orgsQuery.data?.items ?? []).map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("filters.openAria")}
            >
              <Filter className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("filters.menuLabel")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {t("filters.status")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(next) =>
                    setStatusFilter(next as StatusFilter)
                  }
                >
                  <DropdownMenuRadioItem value="all">
                    {t("filters.allStatuses")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="active">
                    {t("filters.status_active")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="disabled">
                    {t("filters.status_disabled")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="failing">
                    {t("filters.status_failing")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          asChild
          type="button"
          size="sm"
          disabled={selectedOrgValue === ""}
        >
          <Link
            href={newHref}
            aria-disabled={selectedOrgValue === "" ? "true" : undefined}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("createCta")}
          </Link>
        </Button>
      </div>

      {statusFilter !== "all" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-foreground">
            <span className="text-muted-foreground">{t("filters.status")}:</span>
            <span>{t(`filters.status_${statusFilter}` as const)}</span>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t("filters.clearChipAria", {
                label: t("filters.status"),
              })}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        </div>
      )}

      {endpointsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : visibleEndpoints.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {trimmedSearch !== ""
            ? t("emptySearch", { query: search.trim() })
            : t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {visibleEndpoints.map((endpoint) => {
            const subCount = endpoint.subscriptions.length
            return (
              <li key={endpoint.id}>
                <Link
                  href={`/admin/webhooks/${endpoint.id}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="block min-w-0 max-w-full truncate text-sm font-medium text-foreground">
                        {endpoint.name}
                      </span>
                      <StatusBadge status={endpoint.status} />
                      {endpoint.consecutiveFailures > 0 &&
                        endpoint.status === "active" && (
                          <Badge variant="warning" size="sm">
                            {t("badges.failing", {
                              count: endpoint.consecutiveFailures,
                            })}
                          </Badge>
                        )}
                    </div>
                    <p className="block min-w-0 max-w-full truncate font-mono text-xs text-muted-foreground">
                      {endpoint.url}
                    </p>
                    {endpoint.description && (
                      <p className="line-clamp-2 wrap-break-word text-xs text-muted-foreground">
                        {endpoint.description}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {t("subscriptionCount", { count: subCount })}
                    </p>
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

function StatusBadge({ status }: { status: "active" | "disabled" }) {
  const t = useTranslations("admin.webhooks.manager.status")
  return (
    <Badge variant={status === "active" ? "success" : "secondary"} size="sm">
      {t(status)}
    </Badge>
  )
}
