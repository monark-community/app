"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeaderBar,
  TableDetailLayout,
  useDetailPanelRoute,
} from "@/components/patterns";
import { SheetTitle } from "@/components/ui/sheet";
import { OrganizationLogo } from "@/components/organization-logo";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import { trpc } from "@/lib/trpc";
import { OrganizationDetail } from "./[id]/organization-detail";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function OrganizationsList() {
  const t = useTranslations("admin.organizations");
  const tTable = useTranslations("table");
  const panel = useDetailPanelRoute("/admin/organizations", "organization");
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);
  const [limit, setLimit] = useState(25);

  useEffect(() => {
    setLimit(25);
  }, [search]);

  const query = trpc.organizations.adminList.useQuery(
    { search: search || undefined, limit },
    { refetchOnWindowFocus: false, placeholderData: keepPreviousData },
  );

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const hasMore = Boolean(query.data?.nextCursor);
  const canLoadMore = hasMore && limit < 100;

  return (
    <div className="space-y-3">
      <FilterBar
        search={
          <FilterBarSearch
            value={rawSearch}
            onChange={setRawSearch}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
          />
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        panelClassName="sm:max-w-xl"
        panel={
          <>
            <PanelHeaderBar
              onCollapse={panel.close}
              collapseLabel={t("collapsePanel")}
              fullPageHref={
                panel.selectedId ? `/admin/organizations/${panel.selectedId}` : undefined
              }
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <SheetTitle className="sr-only">{t("panelTitle")}</SheetTitle>
              {panel.selectedId && (
                <OrganizationDetail
                  key={panel.selectedId}
                  orgId={panel.selectedId}
                  containment="container"
                />
              )}
            </div>
          </>
        }
        table={
          <DataTable
            data={items}
            getRowId={(o) => o.id}
            storageKey="admin-organizations-table"
            labels={{
              columns: tTable("columns"),
              reset: tTable("reset"),
              rowActions: tTable("rowActions"),
              openPanel: tTable("openPanel"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={panel.selectedId}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            emptyState={search ? t("emptySearch", { query: search }) : t("empty")}
            primaryColumn={{
              header: t("columns.name"),
              leading: (org) => (
                <OrganizationLogo
                  logoUrl={org.logoUrl ? rewriteForCurrentHost(org.logoUrl) : null}
                  size="sm"
                />
              ),
              label: (org) => org.displayName,
              subtext: (org) => <span className="font-mono">{org.slug}</span>,
              href: (org) => `/admin/organizations?organization=${org.id}`,
              enableSorting: true,
              sortAccessor: (org) => org.displayName,
            }}
            columns={[
              {
                id: "color",
                header: t("columns.color"),
                align: "right",
                // Swatch always renders ; null primaryColor falls back to
                // white so a fresh org still shows a (bordered) dot.
                cell: (org) => (
                  <span className="ml-auto flex justify-end">
                    <span
                      aria-hidden
                      className="h-4 w-4 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: org.primaryColor ?? "#FFFFFF" }}
                    />
                  </span>
                ),
                size: 96,
              },
            ]}
          />
        }
      />

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
  );
}
