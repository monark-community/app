"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Braces, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SheetTitle } from "@/components/ui/sheet";
import {
  DataTable,
  FilterBar,
  FilterBarSearch,
  PanelHeader,
  TableDetailLayout,
  TableEmptyState,
  tableEmptyReason,
  useDataTableLayout,
  useDetailPanelRoute,
  type DataColumnDef,
  type PrimaryColumnDef,
} from "@/components/patterns";
import { useDebounced } from "@/components/fields";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";
import { useTableEmptyLabels } from "@/lib/use-table-empty-labels";
import { ServiceAccountPanel } from "./service-account-panel";

export function ServiceAccountsManager() {
  const t = useTranslations("admin.serviceAccounts");
  const tTable = useTranslations("table");
  const locale = useLocale();

  const panel = useDetailPanelRoute("/admin/service-accounts", "sa");
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 200);

  const query = trpc.apiKeys.serviceAccounts.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const allRows = useMemo(() => query.data ?? [], [query.data]);
  type Row = (typeof allRows)[number];
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    if (q === "") return allRows;
    return allRows.filter((s) => s.name.toLowerCase().includes(q));
  }, [allRows, search]);

  const selected = allRows.find((s) => s.id === panel.selectedId);
  const layout = useDataTableLayout("admin-service-accounts-table");
  const emptyLabels = useTableEmptyLabels({ query: search, noData: t("empty") });

  const primaryColumn: PrimaryColumnDef<Row> = {
    header: t("columns.name"),
    headerIcon: Braces,
    leading: () => <Braces className="h-4 w-4 text-muted-foreground" aria-hidden />,
    label: (s) => <span className="font-medium">{s.name}</span>,
    subtext: (s) =>
      s.disabledAt ? t("status.disabled") : t("rolesCount", { count: s.roleIds.length }),
    onSelect: (s) => panel.open(s.id),
    enableSorting: true,
    sortAccessor: (s) => s.name,
  };

  const columns: DataColumnDef<Row>[] = [
    {
      id: "status",
      header: t("columns.status"),
      cell: (s) => (
        <Badge variant={s.disabledAt ? "secondary" : "success"}>
          {s.disabledAt ? t("status.disabled") : t("status.active")}
        </Badge>
      ),
      sortAccessor: (s) => (s.disabledAt ? 1 : 0),
    },
    {
      id: "keys",
      header: t("columns.keys"),
      cell: (s) => <span className="text-muted-foreground">{s.keyCount}</span>,
      sortAccessor: (s) => s.keyCount,
      align: "right",
    },
    {
      id: "created",
      header: t("columns.created"),
      cell: (s) => (
        <span className="text-muted-foreground">
          {formatRelativeTime(s.createdAt as unknown as string, locale)}
        </span>
      ),
      sortAccessor: (s) => new Date(s.createdAt as unknown as string),
      align: "right",
    },
  ];

  return (
    <>
      <FilterBar
        search={
          <FilterBarSearch
            value={rawSearch}
            onChange={setRawSearch}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
          />
        }
        actions={
          <Button onClick={panel.openCreate}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            {t("createCta")}
          </Button>
        }
      />

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey="admin-service-accounts"
        panelClassName="sm:max-w-xl"
        panel={
          <>
            <SheetTitle className="sr-only">
              {panel.isCreate ? t("panelCreateTitle") : (selected?.name ?? t("title"))}
            </SheetTitle>
            {panel.isCreate ? (
              <>
                <PanelHeader title={t("panelCreateTitle")} onClose={panel.close} />
                <div className="flex-1 overflow-y-auto px-6 py-6">
                  <CreateServiceAccountForm
                    onCreated={(id) => panel.open(id)}
                    onCancel={panel.close}
                  />
                </div>
              </>
            ) : selected ? (
              <ServiceAccountPanel
                key={selected.id}
                account={selected}
                onClose={panel.close}
                onDeleted={panel.close}
              />
            ) : null}
          </>
        }
        table={
          <DataTable
            data={rows}
            getRowId={(s) => s.id}
            selectedRowId={panel.selectedId}
            primaryColumn={primaryColumn}
            columns={columns}
            storageKey="admin-service-accounts-table"
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            isLoading={query.isLoading}
            isError={query.isError}
            onRetry={() => query.refetch()}
            emptyState={
              <TableEmptyState
                reason={tableEmptyReason({ hasSearch: search.length > 0, hasFilters: false })}
                labels={emptyLabels}
                onClearSearch={() => setRawSearch("")}
                createAction={{ label: t("createCta"), onClick: panel.openCreate }}
              />
            }
          />
        }
      />
    </>
  );
}

// ── Create form (name + role checklist) ──────────────────────────────
function CreateServiceAccountForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.serviceAccounts");
  const tCommon = useTranslations("common");
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());

  const rolesQuery = trpc.apiKeys.serviceAccounts.assignableRoles.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const roles = rolesQuery.data ?? [];

  const createMutation = trpc.apiKeys.serviceAccounts.create.useMutation({
    onSuccess: async (result) => {
      toast.success(t("form.createSuccess"));
      await utils.apiKeys.serviceAccounts.list.invalidate();
      onCreated(result.id);
    },
    onError: (err) => toast.error(err.message || t("form.saveError")),
  });

  function toggle(id: string, checked: boolean) {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("form.description")}</p>

      <div className="space-y-1.5">
        <Label htmlFor="sa-name">{t("form.nameLabel")}</Label>
        <Input
          id="sa-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("form.namePlaceholder")}
          maxLength={100}
          autoFocus
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("form.rolesLabel")}</legend>
        <p className="text-xs text-muted-foreground">{t("form.rolesHelp")}</p>
        {roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("form.noRoles")}</p>
        ) : (
          <div className="space-y-2">
            {roles.map((role) => {
              const id = `sa-role-${role.id}`;
              return (
                <label
                  key={role.id}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:border-primary/50"
                >
                  <Checkbox
                    id={id}
                    checked={roleIds.has(role.id)}
                    onChange={(e) => toggle(role.id, e.target.checked)}
                  />
                  <span className="text-sm font-medium">{role.name}</span>
                  {role.builtIn && <Badge variant="secondary">{t("form.builtIn")}</Badge>}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={createMutation.isPending}>
          {tCommon("cancel")}
        </Button>
        <Button
          onClick={() => createMutation.mutate({ name: name.trim(), roleIds: [...roleIds] })}
          disabled={name.trim().length === 0 || createMutation.isPending}
        >
          {createMutation.isPending ? tCommon("loading") : t("form.submit")}
        </Button>
      </div>
    </div>
  );
}
