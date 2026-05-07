"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Lock,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"

const ADMIN_ROLE_KEY = "ADMIN"

/**
 * Convert a free-form role name into a server-acceptable role key :
 * lowercase, non-alphanumeric collapsed to single underscores, trimmed
 * to 60 chars, fallback to "role" if the result is empty so the
 * server-side regex (`^[a-z0-9_-]+$`, 2–60 chars) always validates.
 *
 * The key is identity for code-side guards ; we never expose it in
 * the editor UI. Auto-deriving keeps round-trips legible — collisions
 * with existing keys surface as a server validation error in the
 * toast, so the operator picks a different name.
 */
function deriveKeyFromName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
  if (cleaned.length < 2) return "role"
  return cleaned
}

/**
 * Full-page editor for the role table on /admin/rbac. Two modes :
 *
 *  - `create` : operator types a name + optional description / color,
 *    picks permissions, hits Create. The role key is auto-derived
 *    from the name and validated server-side ; collisions surface as
 *    a toast. Lands on the parent `/admin/rbac` page on success.
 *  - `edit` : pre-fills from `rbac.adminListRoles`, submits via
 *    `adminUpdateRole`, and surfaces a Delete button in the page
 *    footer. Built-in `ADMIN` locks the permission grid (it
 *    short-circuits to "all granted" in code-side guards).
 *
 * The permission matrix comes from `rbac.adminListPermissions` so the
 * UI doesn't hardcode the list. Categories collapse / expand with a
 * tri-state header checkbox (none / some / all) for fast bulk toggles
 * and a filter box that searches keys + descriptions across every
 * category at once ; matching categories auto-expand while a query is
 * active so hits are visible without the operator having to click.
 *
 * Replaces the previous modal-based editor : a full page gives the
 * operator a clearer view of the permissions list and the surrounding
 * role metadata, with no dialog-frame chrome eating the viewport on
 * dense permission sets.
 */
export function RoleEditor(
  props:
    | { mode: "create"; organizationId: string }
    | { mode: "edit"; roleId: string },
) {
  const t = useTranslations("admin.rbac.editor")
  const router = useRouter()
  const utils = trpc.useUtils()
  const isEdit = props.mode === "edit"

  const permsQuery = trpc.rbac.adminListPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })

  // Edit-mode loads the role's existing record by id (org-agnostic ;
  // the role row carries its own organizationId). Create-mode skips
  // this query entirely.
  const roleByIdQuery = trpc.rbac.adminGetRole.useQuery(
    isEdit ? { id: props.roleId } : { id: "" },
    { enabled: isEdit, refetchOnWindowFocus: false },
  )

  const role = isEdit ? roleByIdQuery.data ?? null : null
  const isBuiltInAdmin =
    role !== null && role.builtIn && role.key === ADMIN_ROLE_KEY

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState("")
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(!isEdit)

  // Edit mode hydrates form state from the loaded role (once). Create
  // mode starts with an empty form ; no hydration needed.
  useEffect(() => {
    if (!isEdit) return
    if (!role) return
    if (hydrated) return
    setName(role.name)
    setDescription(role.description ?? "")
    setColor(role.color ?? "")
    setPermissions(new Set(role.permissions.map((p) => p.permission)))
    setHydrated(true)
  }, [hydrated, isEdit, role])

  const create = trpc.rbac.adminCreateRole.useMutation({
    onSuccess: () => {
      void utils.rbac.adminListRoles.invalidate()
      toast.success(t("createSuccess"))
      router.push("/admin/rbac")
      router.refresh()
    },
    onError: (error) => toast.error(error.message || t("createError")),
  })

  const update = trpc.rbac.adminUpdateRole.useMutation({
    onSuccess: () => {
      void utils.rbac.adminListRoles.invalidate()
      void utils.rbac.adminGetRole.invalidate()
      toast.success(t("updateSuccess"))
      router.push("/admin/rbac")
      router.refresh()
    },
    onError: (error) => toast.error(error.message || t("updateError")),
  })

  const remove = trpc.rbac.adminDeleteRole.useMutation({
    onSuccess: () => {
      void utils.rbac.adminListRoles.invalidate()
      toast.success(t("deleteSuccess"))
      router.push("/admin/rbac")
      router.refresh()
    },
    onError: (error) => toast.error(error.message || t("deleteError")),
  })

  const submitting = create.isPending || update.isPending || remove.isPending

  // Search index : lowercase needle, hit on key or description per
  // permission. Empty needle is a no-op (all permissions visible).
  const needle = search.trim().toLowerCase()
  const filteredCategories = useMemo(() => {
    const cats = permsQuery.data?.categories ?? []
    if (needle === "") return cats
    return cats
      .map((cat) => ({
        ...cat,
        permissions: cat.permissions.filter(
          (p) =>
            p.key.toLowerCase().includes(needle) ||
            p.description.toLowerCase().includes(needle),
        ),
      }))
      .filter((cat) => cat.permissions.length > 0)
  }, [permsQuery.data, needle])

  // While a search is active, expose every matching category. The
  // ref-guarded check skips re-applying when the operator manually
  // collapses a section ; the auto-expand only fires on needle change.
  const previousNeedle = useRef("")
  useEffect(() => {
    if (needle === previousNeedle.current) return
    previousNeedle.current = needle
    if (needle === "") return
    setOpenCategories(new Set(filteredCategories.map((c) => c.category)))
  }, [needle, filteredCategories])

  function toggleCategoryOpen(category: string, open: boolean) {
    setOpenCategories((current) => {
      const out = new Set(current)
      if (open) out.add(category)
      else out.delete(category)
      return out
    })
  }

  function togglePermission(permission: string, next: boolean) {
    setPermissions((current) => {
      const out = new Set(current)
      if (next) out.add(permission)
      else out.delete(permission)
      return out
    })
  }

  function toggleCategoryAll(categoryPerms: ReadonlyArray<{ key: string }>) {
    setPermissions((current) => {
      const out = new Set(current)
      const allSelected = categoryPerms.every((p) => out.has(p.key))
      if (allSelected) {
        for (const p of categoryPerms) out.delete(p.key)
      } else {
        for (const p of categoryPerms) out.add(p.key)
      }
      return out
    })
  }

  function onSubmit() {
    const trimmedName = name.trim()
    if (trimmedName.length < 1) {
      toast.error(t("nameRequired"))
      return
    }
    const trimmedColor = color.trim() || null
    const list = Array.from(permissions)
    if (isEdit && role) {
      update.mutate({
        id: role.id,
        name: trimmedName,
        description: description.trim() || null,
        color: trimmedColor,
        permissions: isBuiltInAdmin ? undefined : list,
      })
      return
    }
    if (!isEdit) {
      create.mutate({
        organizationId: props.organizationId,
        key: deriveKeyFromName(trimmedName),
        name: trimmedName,
        description: description.trim() || null,
        color: trimmedColor,
        permissions: list,
      })
    }
  }

  function onDelete() {
    if (!isEdit || !role) return
    if (
      !confirm(
        t("deleteConfirm", { name: role.name }),
      )
    ) {
      return
    }
    remove.mutate({ id: role.id })
  }

  if (isEdit && (roleByIdQuery.isLoading || (!role && !roleByIdQuery.error))) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (isEdit && roleByIdQuery.error) {
    return (
      <div className="space-y-3">
        <Link
          href="/admin/rbac"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
        <p className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {roleByIdQuery.error.message || t("loadError")}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/rbac"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("back")}
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit
            ? t("editTitle", { name: role?.name ?? "" })
            : t("createTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEdit ? t("editSubtitle") : t("createSubtitle")}
        </p>
      </header>

      <div className="grid gap-4 rounded-lg border border-border p-4">
        <div className="grid gap-2">
          <Label htmlFor="role-name">{t("nameLabel")}</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={80}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="role-description">{t("descriptionLabel")}</Label>
          <Textarea
            id="role-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("descriptionPlaceholder")}
            rows={2}
            maxLength={280}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="role-color">{t("colorLabel")}</Label>
          <div className="flex items-center gap-3">
            <Input
              id="role-color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              placeholder="#F0870C"
              className="font-mono"
              maxLength={7}
            />
            <span
              aria-hidden
              className="h-9 w-9 shrink-0 rounded-md border border-border"
              style={{
                backgroundColor:
                  color && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
                    ? color
                    : "transparent",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("colorHint")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>{t("permissionsLabel")}</Label>
          {isBuiltInAdmin && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden />
              {t("permissionsLocked")}
            </span>
          )}
        </div>
        {isBuiltInAdmin ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {t("permissionsAdminNote")}
          </p>
        ) : (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchAria")}
                className="pl-8"
              />
            </div>
            <div className="space-y-2 rounded-md border border-border p-2">
              {filteredCategories.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  {t("searchEmpty")}
                </p>
              ) : (
                filteredCategories.map((cat) => (
                  <CategorySection
                    key={cat.category}
                    categoryLabel={t(`categories.${cat.category}` as const)}
                    permissions={cat.permissions}
                    selected={permissions}
                    open={openCategories.has(cat.category)}
                    onOpenChange={(next) =>
                      toggleCategoryOpen(cat.category, next)
                    }
                    onToggleAll={() => toggleCategoryAll(cat.permissions)}
                    onTogglePermission={togglePermission}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          {isEdit && role && !role.builtIn && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              disabled={submitting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("deleteCta")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/rbac")}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || (isEdit && !role)}
          >
            {submitting
              ? t("submitting")
              : isEdit
                ? t("save")
                : t("create")}
          </Button>
        </div>
      </div>
    </div>
  )
}

type CategoryPermission = {
  key: string
  description: string
}

function CategorySection({
  categoryLabel,
  permissions,
  selected,
  open,
  onOpenChange,
  onToggleAll,
  onTogglePermission,
}: {
  categoryLabel: string
  permissions: ReadonlyArray<CategoryPermission>
  selected: Set<string>
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleAll: () => void
  onTogglePermission: (permission: string, next: boolean) => void
}) {
  const t = useTranslations("admin.rbac.editor")
  const total = permissions.length
  const selectedCount = permissions.reduce(
    (acc, perm) => acc + (selected.has(perm.key) ? 1 : 0),
    0,
  )
  const state: "none" | "some" | "all" =
    selectedCount === 0 ? "none" : selectedCount === total ? "all" : "some"

  // Drive the native checkbox `indeterminate` flag through a ref ;
  // React doesn't expose it as a JSX prop. Re-applies on every
  // render so it tracks `state` live.
  const checkboxRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = state === "some"
    }
  }, [state])

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={state === "all"}
          onChange={onToggleAll}
          aria-label={t("toggleAllAria", { category: categoryLabel })}
          className="h-4 w-4 cursor-pointer"
          onClick={(event) => event.stopPropagation()}
        />
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center justify-between gap-2 rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              )}
              {categoryLabel}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                state === "all"
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t("categoryCount", { selected: selectedCount, total })}
            </span>
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="space-y-1 px-2 pb-1 pt-1">
          {permissions.map((perm) => {
            const checked = selected.has(perm.key)
            return (
              <li key={perm.key}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      onTogglePermission(perm.key, event.target.checked)
                    }
                    className="mt-1 h-4 w-4 cursor-pointer"
                  />
                  <span className="flex-1 space-y-0.5">
                    <span className="block font-mono text-xs">{perm.key}</span>
                    <span className="block text-xs text-muted-foreground">
                      {perm.description}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
