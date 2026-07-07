"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColorInput } from "@/components/ui/color-input";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DangerCard, DangerRow } from "@/components/danger-card";
import {
  ConfirmDialog,
  FieldRow,
  GroupedMultiSelect,
  type GroupedMultiSelectGroup,
} from "@/components/patterns";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/page-section";
import { trpc } from "@/lib/trpc";

const ADMIN_ROLE_KEY = "ADMIN";

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
    .slice(0, 60);
  if (cleaned.length < 2) return "role";
  return cleaned;
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
  props: ({ mode: "create"; organizationId: string } | { mode: "edit"; roleId: string }) & {
    containment?: "viewport" | "container";
    onClose?: () => void;
  },
) {
  const t = useTranslations("admin.rbac.editor");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const utils = trpc.useUtils();
  const isEdit = props.mode === "edit";
  // Panel mode : the editor renders inside a detail panel, so it drops its
  // own PageHeader (the panel supplies PanelHeaderBar), anchors the save
  // bar to the panel, and closes the panel on success instead of routing.
  const containment = props.containment ?? "viewport";
  const inPanel = containment === "container";
  const done =
    props.onClose ??
    (() => {
      router.push("/admin/rbac");
      router.refresh();
    });

  const permsQuery = trpc.rbac.adminListPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // Edit-mode loads the role's existing record by id (org-agnostic ;
  // the role row carries its own organizationId). Create-mode skips
  // this query entirely.
  const roleByIdQuery = trpc.rbac.adminGetRole.useQuery(
    isEdit ? { id: props.roleId } : { id: "" },
    { enabled: isEdit, refetchOnWindowFocus: false },
  );

  const role = isEdit ? (roleByIdQuery.data ?? null) : null;
  const isBuiltInAdmin = role !== null && role.builtIn && role.key === ADMIN_ROLE_KEY;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(!isEdit);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Edit mode hydrates form state from the loaded role (once). Create
  // mode starts with an empty form ; no hydration needed.
  useEffect(() => {
    if (!isEdit) return;
    if (!role) return;
    if (hydrated) return;
    setName(role.name);
    setDescription(role.description ?? "");
    setColor(role.color ?? "");
    setPermissions(new Set(role.permissions.map((p) => p.permission)));
    setHydrated(true);
  }, [hydrated, isEdit, role]);

  const create = trpc.rbac.adminCreateRole.useMutation({
    onSuccess: () => {
      void utils.rbac.adminListRoles.invalidate();
      toast.success(t("createSuccess"));
      done();
    },
    onError: (error) => toast.error(error.message || t("createError")),
  });

  const update = trpc.rbac.adminUpdateRole.useMutation({
    onSuccess: () => {
      void utils.rbac.adminListRoles.invalidate();
      void utils.rbac.adminGetRole.invalidate();
      toast.success(t("updateSuccess"));
      done();
    },
    onError: (error) => toast.error(error.message || t("updateError")),
  });

  const remove = trpc.rbac.adminDeleteRole.useMutation({
    onSuccess: () => {
      void utils.rbac.adminListRoles.invalidate();
      toast.success(t("deleteSuccess"));
      done();
    },
    onError: (error) => toast.error(error.message || t("deleteError")),
  });

  const submitting = create.isPending || update.isPending || remove.isPending;

  // Permission catalog shaped for the shared grouped selector : one group
  // per category, one row per permission (mono key + description). The
  // selector owns search + expand ; we pass the full list.
  const permissionGroups = useMemo<GroupedMultiSelectGroup[]>(
    () =>
      (permsQuery.data?.categories ?? []).map((cat) => ({
        key: cat.category,
        label: t(`categories.${cat.category}` as const),
        items: cat.permissions.map((p) => ({
          value: p.key,
          primary: p.key,
          secondary: p.description,
        })),
      })),
    [permsQuery.data, t],
  );

  function togglePermission(permission: string, next: boolean) {
    setPermissions((current) => {
      const out = new Set(current);
      if (next) out.add(permission);
      else out.delete(permission);
      return out;
    });
  }

  function setGroupSelection(group: GroupedMultiSelectGroup, selectAll: boolean) {
    setPermissions((current) => {
      const out = new Set(current);
      for (const item of group.items) {
        if (selectAll) out.add(item.value);
        else out.delete(item.value);
      }
      return out;
    });
  }

  function onSubmit() {
    const trimmedName = name.trim();
    if (trimmedName.length < 1) {
      toast.error(t("nameRequired"));
      return;
    }
    const trimmedColor = color.trim() || null;
    const list = Array.from(permissions);
    if (isEdit && role) {
      update.mutate({
        id: role.id,
        name: trimmedName,
        description: description.trim() || null,
        color: trimmedColor,
        permissions: isBuiltInAdmin ? undefined : list,
      });
      return;
    }
    if (!isEdit) {
      create.mutate({
        organizationId: props.organizationId,
        key: deriveKeyFromName(trimmedName),
        name: trimmedName,
        description: description.trim() || null,
        color: trimmedColor,
        permissions: list,
      });
    }
  }

  // Dirty-state vs the loaded baseline (edit mode) or the empty form
  // (create mode). Drives the sticky save bar's visibility ; the bar
  // only slides up once the operator has actually changed something.
  const dirty = useMemo(() => {
    if (isEdit) {
      if (!role) return false;
      const baselinePerms = new Set(role.permissions.map((p) => p.permission));
      if (name.trim() !== role.name) return true;
      if ((description.trim() || null) !== (role.description ?? null)) {
        return true;
      }
      if ((color.trim() || null) !== (role.color ?? null)) return true;
      if (!isBuiltInAdmin) {
        if (permissions.size !== baselinePerms.size) return true;
        for (const p of permissions) {
          if (!baselinePerms.has(p)) return true;
        }
      }
      return false;
    }
    return (
      name.trim() !== "" || description.trim() !== "" || color.trim() !== "" || permissions.size > 0
    );
  }, [isEdit, role, isBuiltInAdmin, name, description, color, permissions]);

  function onCancel() {
    if (isEdit && role) {
      setName(role.name);
      setDescription(role.description ?? "");
      setColor(role.color ?? "");
      setPermissions(new Set(role.permissions.map((p) => p.permission)));
      return;
    }
    setName("");
    setDescription("");
    setColor("");
    setPermissions(new Set());
  }

  function confirmDelete() {
    if (!isEdit || !role) return;
    remove.mutate({ id: role.id });
  }

  if (isEdit && (roleByIdQuery.isLoading || (!role && !roleByIdQuery.error))) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isEdit && roleByIdQuery.error) {
    return (
      <div className="space-y-8">
        <PageHeader
          title={t("editTitle", { name: "" })}
          backHref="/admin/rbac"
          backLabel={t("back")}
        />
        <p className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {roleByIdQuery.error.message || t("loadError")}
        </p>
      </div>
    );
  }

  return (
    <div className={inPanel ? "space-y-8 pb-20" : "space-y-8"}>
      {/* Panel mode : the PanelHeader shows the create/edit title, so the
          content skips it. Full page keeps the PageHeader. */}
      {!inPanel && (
        <PageHeader
          title={isEdit ? t("editTitle", { name: role?.name ?? "" }) : t("createTitle")}
          subtitle={isEdit ? t("editSubtitle") : t("createSubtitle")}
          backHref="/admin/rbac"
          backLabel={t("back")}
        />
      )}

      <PageSection title={t("identitySectionTitle")}>
        <div className="@container space-y-5">
          <FieldRow label={t("nameLabel")} htmlFor="role-name">
            <Input
              id="role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={80}
            />
          </FieldRow>
          <FieldRow label={t("descriptionLabel")} htmlFor="role-description">
            <Textarea
              id="role-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={2}
              maxLength={280}
            />
          </FieldRow>
          <FieldRow label={t("colorLabel")} htmlFor="role-color">
            <ColorInput
              id="role-color"
              value={color}
              onChange={setColor}
              placeholder="#F0870C"
              aria-label={t("colorLabel")}
            />
            <p className="text-xs text-muted-foreground">{t("colorHint")}</p>
          </FieldRow>
        </div>
      </PageSection>

      <Separator />

      <PageSection
        title={t("permissionsLabel")}
        subtitle={isBuiltInAdmin ? undefined : t("permissionsSectionSubtitle")}
        action={
          isBuiltInAdmin ? (
            <Badge variant="secondary" size="sm">
              <Lock className="h-3 w-3" aria-hidden />
              {t("permissionsLocked")}
            </Badge>
          ) : undefined
        }
      >
        {isBuiltInAdmin ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {t("permissionsAdminNote")}
          </p>
        ) : (
          <GroupedMultiSelect
            groups={permissionGroups}
            isChecked={(value) => permissions.has(value)}
            onToggleItem={(_group, value, next) => togglePermission(value, next)}
            onToggleGroup={setGroupSelection}
            renderEmpty={() => t("searchEmpty")}
            labels={{
              searchPlaceholder: t("searchPlaceholder"),
              searchAria: t("searchAria"),
              toggleAllAria: (category) => t("toggleAllAria", { category }),
            }}
          />
        )}
      </PageSection>

      {isEdit && role && !role.builtIn && (
        <DangerCard title={t("dangerSectionTitle")}>
          <DangerRow
            title={t("deleteCta")}
            description={t("deleteRowDescription")}
            action={
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={submitting}
              >
                {t("deleteCta")}
              </Button>
            }
          />
        </DangerCard>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t("deleteCta")}
        description={t("deleteConfirm", { name: role?.name ?? "" })}
        cancelLabel={t("cancel")}
        confirmLabel={t("deleteCta")}
        isPending={remove.isPending}
        onConfirm={confirmDelete}
      />

      <DirtyFormBar
        containment={containment}
        open={dirty}
        onSave={onSubmit}
        onCancel={onCancel}
        saving={submitting}
        saveLabel={isEdit ? t("save") : t("create")}
        savingLabel={t("submitting")}
        cancelLabel={t("cancel")}
        message={tCommon("unsavedChanges")}
      />
    </div>
  );
}
