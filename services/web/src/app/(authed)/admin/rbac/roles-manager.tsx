"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CreateFab,
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeader,
  TableDetailLayout,
  TableEmptyState,
  TableTools,
  tableEmptyReason,
  useDataTableLayout,
  useDetailPanelRoute,
  type DataColumnDef,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { useTableEmptyLabels } from "@/lib/use-table-empty-labels";
import { RoleEditor } from "./role-editor";

const ADMIN_ROLE_KEY = "ADMIN";

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
  const t = useTranslations("admin.rbac.manager");
  const tTable = useTranslations("table");
  const tFilters = useTranslations("filters");
  const panel = useDetailPanelRoute("/admin/rbac", "role");

  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const singletonId = status.data?.singletonOrganizationId ?? null;

  // Roles are always scoped to the one organization the app serves.
  const [selectedOrgId, setSelectedOrgId] = useState("");
  useEffect(() => {
    if (singletonId) setSelectedOrgId(singletonId);
  }, [singletonId]);

  const rolesQuery = trpc.rbac.adminListRoles.useQuery(
    { organizationId: selectedOrgId },
    { enabled: selectedOrgId !== "", refetchOnWindowFocus: false },
  );

  // Search filters the list client-side : the result set is small
  // (a handful of rows per org) so a debounced server search would
  // be over-engineered. Case-insensitive match against name + key.
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const allRoles = rolesQuery.data ?? [];
  const visibleRoles = useMemo(() => {
    if (trimmedSearch === "") return allRoles;
    return allRoles.filter(
      (role) =>
        role.name.toLowerCase().includes(trimmedSearch) ||
        role.key.toLowerCase().includes(trimmedSearch),
    );
  }, [allRoles, trimmedSearch]);

  type RoleRow = (typeof allRoles)[number];

  const emptyLabels = useTableEmptyLabels({ query: search.trim(), noData: t("empty") });

  const layout = useDataTableLayout("admin-roles-table");

  const primaryColumn: PrimaryColumnDef<RoleRow> = {
    header: t("columns.name"),
    leading: (role) => (
      <span
        aria-hidden
        className="h-3 w-3 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: role.color ?? "#71717a" }}
      />
    ),
    label: (role) => role.name,
    subtext: (role) => role.description ?? undefined,
    href: (role) => `/admin/rbac?role=${role.id}`,
    enableSorting: true,
    sortAccessor: (role) => role.name,
  };

  const roleColumns: DataColumnDef<RoleRow>[] = [
    {
      id: "type",
      header: t("columns.type"),
      cell: (role) =>
        role.builtIn ? (
          <span className="flex items-center gap-2">
            <Badge variant="secondary" size="sm">
              <Lock className="h-3 w-3" aria-hidden />
              {t("badges.builtIn")}
            </Badge>
            {role.key === ADMIN_ROLE_KEY && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("badges.allPermissions")}
              </span>
            )}
          </span>
        ) : null,
      size: 200,
    },
  ];

  const toolsLabels: TableToolsLabels = {
    tools: tTable("tools"),
    close: tFilters("close"),
    columns: tTable("columns"),
    reset: tTable("reset"),
    sort: {
      label: tTable("sorting"),
      ascending: tTable("sortAscending"),
      descending: tTable("sortDescending"),
      none: tTable("sortNone"),
      addField: tTable("sortAddField"),
      remove: tTable("sortRemove"),
      reset: tTable("sortReset"),
    },
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("listSubtitle")}</p>

      <FilterBar
        search={
          <FilterBarSearch
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
          />
        }
        tools={
          <TableTools
            layout={layout}
            primaryColumn={primaryColumn}
            columns={roleColumns}
            labels={toolsLabels}
            include={["filters", "sorting"]}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <TableTools
              layout={layout}
              primaryColumn={primaryColumn}
              columns={roleColumns}
              labels={toolsLabels}
              include={["columns"]}
            />
            <Button type="button" onClick={panel.openCreate} disabled={selectedOrgId === ""}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("createCta")}
            </Button>
          </div>
        }
        mobileOptions={
          <TableTools
            mode="sheet"
            layout={layout}
            primaryColumn={primaryColumn}
            columns={roleColumns}
            labels={toolsLabels}
            include={["sorting", "columns"]}
          />
        }
      />
      {!panel.isOpen && selectedOrgId !== "" && (
        <CreateFab onClick={panel.openCreate} label={t("createCta")} />
      )}

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey="admin-roles"
        panelClassName="sm:max-w-2xl"
        panel={
          <>
            <SheetTitle className="sr-only">
              {panel.isCreate ? t("panelCreateTitle") : t("panelEditTitle")}
            </SheetTitle>
            <PanelHeader
              title={panel.isCreate ? t("panelCreateTitle") : t("panelEditTitle")}
              onClose={panel.close}
              fullPageHref={
                !panel.isCreate && panel.selectedId
                  ? `/admin/rbac/roles/${panel.selectedId}`
                  : undefined
              }
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {panel.isCreate ? (
                <RoleEditor
                  key="new"
                  mode="create"
                  organizationId={selectedOrgId}
                  containment="container"
                  onClose={panel.close}
                />
              ) : panel.selectedId ? (
                <RoleEditor
                  key={panel.selectedId}
                  mode="edit"
                  roleId={panel.selectedId}
                  containment="container"
                  onClose={panel.close}
                />
              ) : null}
            </div>
          </>
        }
        table={
          <DataTable
            data={visibleRoles}
            getRowId={(role) => role.id}
            storageKey="admin-roles-table"
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={panel.selectedId}
            isLoading={rolesQuery.isLoading}
            isError={rolesQuery.isError}
            onRetry={() => rolesQuery.refetch()}
            emptyState={
              <TableEmptyState
                reason={tableEmptyReason({ hasSearch: trimmedSearch !== "", hasFilters: false })}
                labels={emptyLabels}
                onClearSearch={() => setSearch("")}
                createAction={
                  selectedOrgId ? { label: t("createCta"), onClick: panel.openCreate } : undefined
                }
              />
            }
            primaryColumn={primaryColumn}
            columns={roleColumns}
          />
        }
      />
    </div>
  );
}
