"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { keepPreviousData } from "@tanstack/react-query"
import {
  ChevronRight,
  Clock,
  Filter,
  Mail,
  Plus,
  Search,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
import { Skeleton } from "@/components/ui/skeleton"
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite"
import { trpc } from "@/lib/trpc"
import { InviteUserDialog } from "./invite-user-dialog"

type StatusFilter =
  | "all"
  | "active"
  | "pending"
  | "disabled"
  | "pending-deletion"

type EmailVerifiedFilter = "all" | "verified" | "unverified"

// Joined-window presets keep the date filter scrutable without bringing
// in a date-range picker. "All" leaves the field unset on the server
// side ; the rest map to a single ISO datetime via Date math at fetch
// time so the server only sees one canonical input.
type JoinedFilter = "all" | "7d" | "30d" | "90d"

const JOINED_PRESET_DAYS: Record<Exclude<JoinedFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
}

function initialsFor(displayName: string | null, email: string): string {
  const source = (displayName ?? email).trim()
  if (!source) return "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function UsersList() {
  const t = useTranslations("admin.users")
  const utils = trpc.useUtils()
  const [rawSearch, setRawSearch] = useState("")
  const search = useDebounced(rawSearch.trim(), 250)
  const [limit, setLimit] = useState(25)
  // Filter is keyed on the selected role's `id` (FK into the Role
  // table) ; "all" means no role constraint. The dropdown's options
  // come from `rbac.adminListRoles` against the singleton org's id —
  // multi-tenant deploys would need a richer "global role filter"
  // (deferred to backlog).
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [emailFilter, setEmailFilter] = useState<EmailVerifiedFilter>("all")
  const [joinedFilter, setJoinedFilter] = useState<JoinedFilter>("all")
  const [inviteOpen, setInviteOpen] = useState(false)

  // Reset pagination + page-size when any filter changes ; keeps
  // "Load more" pointing at the current narrowing instead of carrying
  // a stale cursor over.
  useEffect(() => {
    setLimit(25)
  }, [search, roleFilter, statusFilter, emailFilter, joinedFilter])

  // Pull the singleton org's role list for the role filter dropdown.
  // Built-in ADMIN + every custom role created via /admin/rbac shows
  // up. Cached aggressively since roles change rarely.
  const bootstrapStatus = trpc.organizations.bootstrapStatus.useQuery(
    undefined,
    { refetchOnWindowFocus: false, staleTime: Infinity },
  )
  const singletonOrgId = bootstrapStatus.data?.singletonOrganizationId ?? null
  const rolesQuery = trpc.rbac.adminListRoles.useQuery(
    { organizationId: singletonOrgId ?? "" },
    {
      enabled: singletonOrgId !== null,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  )

  // Translate the JoinedFilter preset into an absolute ISO timestamp
  // the procedure expects. `useMemo` so the same Date isn't re-derived
  // on every render and the query key stays stable across re-renders.
  const joinedAfterIso = useMemo(() => {
    if (joinedFilter === "all") return undefined
    const days = JOINED_PRESET_DAYS[joinedFilter]
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  }, [joinedFilter])

  // Status filter pivots on whether we even need the user query : the
  // `pending` slice shows only invites and skips the user fetch
  // entirely. Other statuses translate to the server's filter set.
  const statusesForUsers = useMemo(() => {
    if (statusFilter === "all") return undefined
    if (statusFilter === "pending") return [] // sentinel : skip user fetch
    return [statusFilter]
  }, [statusFilter])

  const usersEnabled = statusesForUsers !== undefined ? statusesForUsers.length > 0 : true
  const usersQuery = trpc.users.adminListUsers.useQuery(
    {
      search: search || undefined,
      limit,
      roleIds: roleFilter !== "all" ? [roleFilter] : undefined,
      statuses: statusesForUsers && statusesForUsers.length > 0
        ? (statusesForUsers as Array<"active" | "disabled" | "pending-deletion">)
        : undefined,
      emailVerified:
        emailFilter === "verified"
          ? true
          : emailFilter === "unverified"
            ? false
            : undefined,
      joinedAfter: joinedAfterIso,
    },
    {
      enabled: usersEnabled,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  )

  // Pending invites are pulled regardless of which status filter is on,
  // unless the operator explicitly narrowed to a non-pending bucket
  // (active/disabled/pending-deletion → hide invites since they don't
  // belong to those statuses).
  const showInvites =
    statusFilter === "all" || statusFilter === "pending"
  const invitesQuery = trpc.organizations.invites.adminListAll.useQuery(
    {
      search: search || undefined,
      roleIds: roleFilter !== "all" ? [roleFilter] : undefined,
    },
    {
      enabled: showInvites,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  )

  // Email-verified filter doesn't apply to invites (no verified state
  // until they sign up), so when the operator narrows to verified or
  // unverified, the invite list collapses.
  const invitesVisible =
    showInvites && emailFilter === "all" && joinedFilter === "all"

  const revoke = trpc.organizations.invites.adminRevoke.useMutation({
    onSuccess: () => {
      void utils.organizations.invites.adminListAll.invalidate()
      toast.success(t("invite.revokeSuccess"))
    },
    onError: (error) => {
      toast.error(error.message || t("invite.revokeError"))
    },
  })

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data?.items])
  const invites = useMemo(
    () => (invitesVisible ? (invitesQuery.data ?? []) : []),
    [invitesVisible, invitesQuery.data],
  )
  const hasMore = Boolean(usersQuery.data?.nextCursor)
  const canLoadMore = usersEnabled && hasMore && limit < 100
  const totalRows = users.length + invites.length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[16rem]">
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
              <DropdownMenuSubTrigger>{t("filters.role")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={roleFilter}
                  onValueChange={setRoleFilter}
                >
                  <DropdownMenuRadioItem value="all">
                    {t("filters.allRoles")}
                  </DropdownMenuRadioItem>
                  {(rolesQuery.data ?? []).map((role) => (
                    <DropdownMenuRadioItem key={role.id} value={role.id}>
                      {role.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("filters.status")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(next) => setStatusFilter(next as StatusFilter)}
                >
                  <DropdownMenuRadioItem value="all">
                    {t("filters.allStatuses")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="active">
                    {t("filters.status_active")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="pending">
                    {t("filters.status_pending")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="disabled">
                    {t("filters.status_disabled")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="pending-deletion">
                    {t("filters.status_pending-deletion")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("filters.joined")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={joinedFilter}
                  onValueChange={(next) => setJoinedFilter(next as JoinedFilter)}
                >
                  <DropdownMenuRadioItem value="all">
                    {t("filters.joinedAll")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="7d">
                    {t("filters.joined_7d")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="30d">
                    {t("filters.joined_30d")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="90d">
                    {t("filters.joined_90d")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {t("filters.emailVerified")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={emailFilter}
                  onValueChange={(next) =>
                    setEmailFilter(next as EmailVerifiedFilter)
                  }
                >
                  <DropdownMenuRadioItem value="all">
                    {t("filters.emailAll")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="verified">
                    {t("filters.email_verified")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="unverified">
                    {t("filters.email_unverified")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          {t("invite.cta")}
        </Button>
      </div>

      {(() => {
        // Active-filter chips line. Each chip carries `Label = value`
        // and an × button to clear that filter back to "all". Only
        // applied filters render a chip ; the "all" sentinel maps to
        // no chip at all so the line stays empty in the default state.
        const roleLabel =
          roleFilter !== "all"
            ? rolesQuery.data?.find((r) => r.id === roleFilter)?.name ??
              roleFilter
            : null
        const statusLabel =
          statusFilter !== "all" ? t(`filters.status_${statusFilter}` as const) : null
        const joinedLabel =
          joinedFilter !== "all" ? t(`filters.joined_${joinedFilter}` as const) : null
        const emailLabel =
          emailFilter !== "all"
            ? t(`filters.email_${emailFilter}` as const)
            : null
        const chips: Array<{
          key: string
          label: string
          value: string
          onClear: () => void
        }> = []
        if (roleLabel) {
          chips.push({
            key: "role",
            label: t("filters.role"),
            value: roleLabel,
            onClear: () => setRoleFilter("all"),
          })
        }
        if (statusLabel) {
          chips.push({
            key: "status",
            label: t("filters.status"),
            value: statusLabel,
            onClear: () => setStatusFilter("all"),
          })
        }
        if (joinedLabel) {
          chips.push({
            key: "joined",
            label: t("filters.joined"),
            value: joinedLabel,
            onClear: () => setJoinedFilter("all"),
          })
        }
        if (emailLabel) {
          chips.push({
            key: "emailVerified",
            label: t("filters.emailVerified"),
            value: emailLabel,
            onClear: () => setEmailFilter("all"),
          })
        }
        if (chips.length === 0) return null
        return (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-foreground"
              >
                <span className="text-muted-foreground">{chip.label}:</span>
                <span>{chip.value}</span>
                <button
                  type="button"
                  onClick={chip.onClear}
                  className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t("filters.clearChipAria", { label: chip.label })}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )
      })()}

      {(usersQuery.isLoading || invitesQuery.isLoading) && totalRows === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      ) : totalRows === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {search ? t("emptySearch", { query: search }) : t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {invites.map((invite) => (
            <li key={`invite-${invite.id}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{invite.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {invite.role.name} · {invite.organization.displayName}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-400/10 px-2 py-0.5 text-xs text-amber-500">
                  {t("badges.pending")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => revoke.mutate({ inviteId: invite.id })}
                  disabled={revoke.isPending}
                  aria-label={t("invite.revokeAria", { email: invite.email })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
          {users.map((user) => {
            const avatar = user.avatarUrl
              ? rewriteForCurrentHost(user.avatarUrl)
              : null
            return (
              <li key={`user-${user.id}`}>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/60"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    {avatar && <AvatarImage src={avatar} alt="" />}
                    <AvatarFallback className="text-xs">
                      {initialsFor(user.displayName, user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {user.displayName ?? user.email}
                    </p>
                    {user.displayName && (
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {user.disabledAt && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        <ShieldOff className="h-3 w-3" aria-hidden />
                        {t("badges.disabled")}
                      </span>
                    )}
                    {user.deletedAt && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-2 py-0.5 text-xs text-amber-500">
                        <Clock className="h-3 w-3" aria-hidden />
                        {t("badges.pendingDeletion")}
                      </span>
                    )}
                  </div>
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
            disabled={usersQuery.isFetching}
          >
            {usersQuery.isFetching ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
