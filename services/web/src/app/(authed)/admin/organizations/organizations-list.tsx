"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { keepPreviousData } from "@tanstack/react-query"
import { ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { OrganizationLogo } from "@/components/organization-logo"
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite"
import { trpc } from "@/lib/trpc"

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function OrganizationsList() {
  const t = useTranslations("admin.organizations")
  const [rawSearch, setRawSearch] = useState("")
  const search = useDebounced(rawSearch.trim(), 250)
  const [limit, setLimit] = useState(25)

  useEffect(() => {
    setLimit(25)
  }, [search])

  const query = trpc.organizations.adminList.useQuery(
    { search: search || undefined, limit },
    { refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  )

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items])
  const hasMore = Boolean(query.data?.nextCursor)
  const canLoadMore = hasMore && limit < 100

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={rawSearch}
          onChange={(event) => setRawSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
          aria-label={t("searchLabel")}
        />
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {search ? t("emptySearch", { query: search }) : t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((org) => {
            const logo = org.logoUrl ? rewriteForCurrentHost(org.logoUrl) : null
            return (
              <li key={org.id}>
                <Link
                  href={`/admin/organizations/${org.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/60"
                >
                  <OrganizationLogo logoUrl={logo} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {org.displayName}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {org.slug}
                    </p>
                  </div>
                  {org.primaryColor && (
                    <span
                      aria-hidden
                      className="h-4 w-4 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: org.primaryColor }}
                    />
                  )}
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {canLoadMore && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLimit((current) => Math.min(current + 25, 100))}
            disabled={query.isFetching}
          >
            {query.isFetching ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  )
}
