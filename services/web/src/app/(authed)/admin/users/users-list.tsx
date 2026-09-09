"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Clock, Mail, Plus, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  activeFilterCount,
  clearAllFilters,
  tableEmptyReason,
  useDataTableLayout,
  useDetailPanelRoute,
  type DataColumnDef,
  type FilterConfig,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { SheetTitle } from "@/components/ui/sheet";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";
import { trpc } from "@/lib/trpc";
import { useTableEmptyLabels } from "@/lib/use-table-empty-labels";
import { InviteUserDialog } from "./invite-user-dialog";
import { UserDetail } from "./[id]/user-detail";

// A user's lifecycle bucket. "pending" is synthetic — it maps to open
// invites (rows that have no real user status yet), so it drives invite
// visibility rather than the user-status query.
type StatusValue = "active" | "pending" | "disabled" | "pending-deletion";

type EmailVerifiedFilter = "all" | "verified" | "unverified";

// Joined-window presets keep the date filter scrutable without bringing
// in a date-range picker. "All" leaves the field unset on the server
// side ; the rest map to a single ISO datetime via Date math at fetch
// time so the server only sees one canonical input.
type JoinedFilter = "all" | "7d" | "30d" | "90d";

const JOINED_PRESET_DAYS: Record<Exclude<JoinedFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function initialsFor(displayName: string | null, email: string): string {
  const source = (displayName ?? email).trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function UsersList() {
  const t = useTranslations("admin.users");
  const tFilters = useTranslations("filters");
  const tTable = useTranslations("table");
  const panel = useDetailPanelRoute("/admin/users", "user");
  const utils = trpc.useUtils();
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch.trim(), 250);
  const [limit, setLimit] = useState(25);
  // Filter is keyed on the selected role's `id` (FK into the Role
  // table) ; "all" means no role constraint. The dropdown's options
  // come from `rbac.adminListRoles` against the singleton org's id.
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusValue[]>([]);
  const [emailFilter, setEmailFilter] = useState<EmailVerifiedFilter>("all");
  const [joinedFilter, setJoinedFilter] = useState<JoinedFilter>("all");
  const [inviteOpen, setInviteOpen] = useState(false);

  // Reset pagination + page-size when any filter changes ; keeps
  // "Load more" pointing at the current narrowing instead of carrying
  // a stale cursor over.
  useEffect(() => {
    setLimit(25);
  }, [search, roleFilter, statusFilter, emailFilter, joinedFilter]);

  // Pull the singleton org's role list for the role filter dropdown.
  // Built-in ADMIN + every custom role created via /admin/rbac shows
  // up. Cached aggressively since roles change rarely.
  const bootstrapStatus = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const singletonOrgId = bootstrapStatus.data?.singletonOrganizationId ?? null;
  // Invite rows don't append the org name : there's only ever one org,
  // so the scope is implied.
  const rolesQuery = trpc.rbac.adminListRoles.useQuery(
    { organizationId: singletonOrgId ?? "" },
    {
      enabled: singletonOrgId !== null,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );

  // Translate the JoinedFilter preset into an absolute ISO timestamp
  // the procedure expects. `useMemo` so the same Date isn't re-derived
  // on every render and the query key stays stable across re-renders.
  const joinedAfterIso = useMemo(() => {
    if (joinedFilter === "all") return undefined;
    const days = JOINED_PRESET_DAYS[joinedFilter];
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }, [joinedFilter]);

  // Status filter pivots on whether we even need the user query : the
  // `pending` slice shows only invites and skips the user fetch
  // entirely. Other statuses translate to the server's filter set.
  const statusesForUsers = useMemo(() => {
    if (statusFilter.length === 0) return undefined; // no status filter : all users
    // Drop the synthetic "pending" (invites) ; what's left are real user
    // statuses. An empty result (only "pending" was picked) is the sentinel
    // that skips the user fetch entirely and shows invites alone.
    return statusFilter.filter(
      (s): s is "active" | "disabled" | "pending-deletion" => s !== "pending",
    );
  }, [statusFilter]);

  const usersEnabled = statusesForUsers !== undefined ? statusesForUsers.length > 0 : true;
  const usersQuery = trpc.users.adminListUsers.useQuery(
    {
      search: search || undefined,
      limit,
      roleIds: roleFilter.length > 0 ? roleFilter : undefined,
      statuses: statusesForUsers && statusesForUsers.length > 0 ? statusesForUsers : undefined,
      emailVerified:
        emailFilter === "verified" ? true : emailFilter === "unverified" ? false : undefined,
      joinedAfter: joinedAfterIso,
    },
    {
      enabled: usersEnabled,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  );

  // Pending invites are pulled regardless of which status filter is on,
  // unless the operator explicitly narrowed to a non-pending bucket
  // (active/disabled/pending-deletion → hide invites since they don't
  // belong to those statuses).
  const showInvites = statusFilter.length === 0 || statusFilter.includes("pending");
  const invitesQuery = trpc.organizations.invites.adminListAll.useQuery(
    {
      search: search || undefined,
      roleIds: roleFilter.length > 0 ? roleFilter : undefined,
    },
    {
      enabled: showInvites,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  );

  // Email-verified filter doesn't apply to invites (no verified state
  // until they sign up), so when the operator narrows to verified or
  // unverified, the invite list collapses.
  const invitesVisible = showInvites && emailFilter === "all" && joinedFilter === "all";

  const revoke = trpc.organizations.invites.adminRevoke.useMutation({
    onSuccess: () => {
      void utils.organizations.invites.adminListAll.invalidate();
      toast.success(t("invite.revokeSuccess"));
    },
    onError: (error) => {
      toast.error(error.message || t("invite.revokeError"));
    },
  });

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data?.items]);
  const invites = useMemo(
    () => (invitesVisible ? (invitesQuery.data ?? []) : []),
    [invitesVisible, invitesQuery.data],
  );
  const hasMore = Boolean(usersQuery.data?.nextCursor);
  const canLoadMore = usersEnabled && hasMore && limit < 100;
  const totalRows = users.length + invites.length;

  // Invites and users are heterogeneous but share one list. Merge them into
  // a single discriminated-union row so a single DataTable can render both,
  // invites first (they're the actionable, transient rows).
  const rows = useMemo(
    () => [
      ...invites.map((invite) => ({
        kind: "invite" as const,
        id: `invite-${invite.id}`,
        invite,
      })),
      ...users.map((user) => ({
        kind: "user" as const,
        id: `user-${user.id}`,
        user,
      })),
    ],
    [invites, users],
  );

  type UserRow = (typeof rows)[number];

  const emptyLabels = useTableEmptyLabels({ query: search, noData: t("empty") });

  const layout = useDataTableLayout("admin-users-table");

  const filterConfigs: FilterConfig[] = [
    {
      id: "role",
      type: "multiSelect",
      label: t("filters.role"),
      value: roleFilter,
      onValueChange: setRoleFilter,
      options: (rolesQuery.data ?? []).map((role) => ({
        value: role.id,
        label: role.name,
      })),
    },
    {
      id: "status",
      type: "multiSelect",
      label: t("filters.status"),
      value: statusFilter,
      onValueChange: (v) => setStatusFilter(v as StatusValue[]),
      options: [
        { value: "active", label: t("filters.status_active") },
        { value: "pending", label: t("filters.status_pending") },
        { value: "disabled", label: t("filters.status_disabled") },
        {
          value: "pending-deletion",
          label: t("filters.status_pending-deletion"),
        },
      ],
    },
    {
      id: "joined",
      label: t("filters.joined"),
      value: joinedFilter,
      onValueChange: (v) => setJoinedFilter(v as JoinedFilter),
      options: [
        { value: "all", label: t("filters.joinedAll") },
        { value: "7d", label: t("filters.joined_7d") },
        { value: "30d", label: t("filters.joined_30d") },
        { value: "90d", label: t("filters.joined_90d") },
      ],
    },
    {
      id: "emailVerified",
      label: t("filters.emailVerified"),
      value: emailFilter,
      onValueChange: (v) => setEmailFilter(v as EmailVerifiedFilter),
      options: [
        { value: "all", label: t("filters.emailAll") },
        { value: "verified", label: t("filters.email_verified") },
        {
          value: "unverified",
          label: t("filters.email_unverified"),
        },
      ],
    },
  ];

  const primaryColumn: PrimaryColumnDef<UserRow> = {
    header: t("columns.user"),
    leading: (row) =>
      row.kind === "invite" ? (
        <span
          aria-hidden
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Mail className="h-4 w-4" />
        </span>
      ) : (
        <Avatar className="h-9 w-9 shrink-0">
          {row.user.avatarUrl && (
            <AvatarImage src={rewriteForCurrentHost(row.user.avatarUrl)} alt="" />
          )}
          <AvatarFallback className="text-xs">
            {initialsFor(row.user.displayName, row.user.email)}
          </AvatarFallback>
        </Avatar>
      ),
    label: (row) =>
      row.kind === "invite" ? row.invite.email : (row.user.displayName ?? row.user.email),
    subtext: (row) =>
      row.kind === "invite"
        ? row.invite.role.name
        : row.user.displayName
          ? row.user.email
          : undefined,
    href: (row) => (row.kind === "user" ? `/admin/users?user=${row.user.id}` : undefined),
    size: 320,
  };

  const userColumns: DataColumnDef<UserRow>[] = [
    {
      id: "status",
      header: t("columns.status"),
      align: "right",
      cell: (row) =>
        row.kind === "invite" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-2 py-0.5 text-xs text-amber-500">
            {t("badges.pending")}
          </span>
        ) : (
          <span className="flex items-center justify-end gap-2">
            {row.user.disabledAt && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <ShieldOff className="h-3 w-3" aria-hidden />
                {t("badges.disabled")}
              </span>
            )}
            {row.user.deletedAt && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-2 py-0.5 text-xs text-amber-500">
                <Clock className="h-3 w-3" aria-hidden />
                {t("badges.pendingDeletion")}
              </span>
            )}
          </span>
        ),
      size: 220,
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
    filters: {
      trigger: tFilters("button"),
      title: tFilters("title"),
      close: tFilters("close"),
      clearAll: tFilters("clearAll"),
      resetField: tFilters("resetField"),
      valueCount: (count) => tFilters("activeValues", { count }),
    },
  };

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
        tools={
          <TableTools
            layout={layout}
            primaryColumn={primaryColumn}
            columns={userColumns}
            filters={filterConfigs}
            labels={toolsLabels}
            include={["filters", "sorting"]}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <TableTools
              layout={layout}
              primaryColumn={primaryColumn}
              columns={userColumns}
              labels={toolsLabels}
              include={["columns"]}
            />
            <Button type="button" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("invite.cta")}
            </Button>
          </div>
        }
        mobileOptions={
          <TableTools
            mode="sheet"
            layout={layout}
            primaryColumn={primaryColumn}
            columns={userColumns}
            filters={filterConfigs}
            labels={toolsLabels}
            include={["filters", "sorting", "columns"]}
          />
        }
      />
      {!panel.isOpen && <CreateFab onClick={() => setInviteOpen(true)} label={t("invite.cta")} />}

      <TableDetailLayout
        open={panel.isOpen}
        onClose={panel.close}
        storageKey="admin-users"
        panelClassName="sm:max-w-2xl"
        panel={
          <>
            <SheetTitle className="sr-only">
              {panel.isCreate ? t("panelCreateTitle") : t("panelEditTitle")}
            </SheetTitle>
            <PanelHeader
              title={panel.isCreate ? t("panelCreateTitle") : t("panelEditTitle")}
              onClose={panel.close}
              fullPageHref={panel.selectedId ? `/admin/users/${panel.selectedId}` : undefined}
              fullPageLabel={t("openFullPage")}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {panel.selectedId && (
                <UserDetail
                  key={panel.selectedId}
                  userId={panel.selectedId}
                  containment="container"
                />
              )}
            </div>
          </>
        }
        table={
          <DataTable
            data={rows}
            getRowId={(row) => row.id}
            storageKey="admin-users-table"
            layout={layout}
            labels={{
              rowActions: tTable("rowActions"),
              errorTitle: tTable("loadError"),
              retry: tTable("retry"),
            }}
            selectedRowId={panel.selectedId ? `user-${panel.selectedId}` : null}
            isLoading={(usersQuery.isLoading || invitesQuery.isLoading) && totalRows === 0}
            isError={usersQuery.isError || invitesQuery.isError}
            onRetry={() => {
              void usersQuery.refetch();
              void invitesQuery.refetch();
            }}
            skeletonRows={4}
            emptyState={
              <TableEmptyState
                reason={tableEmptyReason({
                  hasSearch: search.length > 0,
                  hasFilters: activeFilterCount(filterConfigs) > 0,
                })}
                labels={emptyLabels}
                onClearSearch={() => setRawSearch("")}
                onClearFilters={() => clearAllFilters(filterConfigs)}
                createAction={{ label: t("invite.cta"), onClick: () => setInviteOpen(true) }}
              />
            }
            primaryColumn={primaryColumn}
            columns={userColumns}
            rowActions={(row) =>
              row.kind === "invite"
                ? [
                    {
                      label: t("invite.revoke"),
                      icon: Trash2,
                      destructive: true,
                      disabled: revoke.isPending,
                      onSelect: () => revoke.mutate({ inviteId: row.invite.id }),
                    },
                  ]
                : []
            }
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
            disabled={usersQuery.isFetching}
          >
            {usersQuery.isFetching ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
