"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeaderBar,
  TableDetailLayout,
  useDetailPanelRoute,
} from "@/components/patterns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetTitle } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
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
  const panel = useDetailPanelRoute("/admin/rbac", "role");

  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const isSingleTenant = status.data?.mode !== "multi";
  const singletonId = status.data?.singletonOrganizationId ?? null;

  const orgsQuery = trpc.organizations.adminList.useQuery(
    { limit: 100 },
    {
      enabled: !isSingleTenant,
      refetchOnWindowFocus: false,
    },
  );

  const [selectedOrgId, setSelectedOrgId] = useState("");
  // Single-tenant : pin to the singleton automatically.
  useEffect(() => {
    if (isSingleTenant && singletonId) setSelectedOrgId(singletonId);
  }, [isSingleTenant, singletonId]);
  // Multi-tenant : when the orgs list resolves, default to the first
  // entry so the manager is immediately useful.
  useEffect(() => {
    if (selectedOrgId !== "") return;
    if (isSingleTenant) return;
    const first = orgsQuery.data?.items[0];
    if (first) setSelectedOrgId(first.id);
  }, [isSingleTenant, orgsQuery.data, selectedOrgId]);

  const rolesQuery = trpc.rbac.adminListRoles.useQuery(
    { organizationId: selectedOrgId },
    { enabled: selectedOrgId !== "", refetchOnWindowFocus: false },
  );

  // Search filters the list client-side : the result set is small
  // (a handful of rows per org) so a debounced server search would
  // be over-engineered. Case-insensitive match against name + key.
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const orgs = orgsQuery.data?.items ?? [];
  const allRoles = rolesQuery.data ?? [];
  const visibleRoles = useMemo(() => {
    if (trimmedSearch === "") return allRoles;
    return allRoles.filter(
      (role) =>
        role.name.toLowerCase().includes(trimmedSearch) ||
        role.key.toLowerCase().includes(trimmedSearch),
    );
  }, [allRoles, trimmedSearch]);
  const showOrgPicker = !isSingleTenant && orgs.length > 0;

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

      <FilterBar
        search={
          <FilterBarSearch
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
          />
        }
        actions={
          <Button
            type="button"
            size="sm"
            onClick={panel.openCreate}
            disabled={selectedOrgId === ""}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("createCta")}
          </Button>
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        panelClassName="sm:max-w-2xl"
        panel={
          <>
            <PanelHeaderBar
              onCollapse={panel.close}
              collapseLabel={t("collapsePanel")}
              fullPageHref={
                !panel.isCreate && panel.selectedId
                  ? `/admin/rbac/roles/${panel.selectedId}`
                  : undefined
              }
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <SheetTitle className="sr-only">{t("panelTitle")}</SheetTitle>
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
            labels={{
              columns: tTable("columns"),
              reset: tTable("reset"),
              rowActions: tTable("rowActions"),
              openPanel: tTable("openPanel"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={panel.selectedId}
            isLoading={rolesQuery.isLoading}
            isError={rolesQuery.isError}
            onRetry={() => rolesQuery.refetch()}
            emptyState={
              trimmedSearch !== "" ? t("emptySearch", { query: search.trim() }) : t("empty")
            }
            primaryColumn={{
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
            }}
            columns={[
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
            ]}
          />
        }
      />
    </div>
  );
}
