"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageSection } from "@/components/page-section";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleChip } from "@/components/role-chip";
import { trpc } from "@/lib/trpc";

type Assignment = {
  id: string;
  organizationId: string | null;
  // The data layer joins the organization onto every active assignment
  // (see `findAllActiveAssignments`) — left optional here so the
  // component compiles against an older Prisma client that hasn't
  // re-generated this include yet ; once `prisma generate` lands the
  // new include, the live payload populates it.
  organization?: { id: string; slug: string; displayName: string } | null;
  role: {
    id: string;
    key: string;
    name: string;
    // Same story for `color` — Prisma client may need a regen before
    // this surfaces in the generated payload type.
    color?: string | null;
    builtIn: boolean;
    organizationId: string | null;
  };
  grantedAt: Date | string;
};

/**
 * Role-assignment surface for the admin user-detail page. Renders the
 * existing assignments as chips with a remove-X each, plus a dashed
 * outline "+ Add new role" chip that opens a dialog with the assign
 * form ; the form was inline before but pushed the rest of the
 * user-detail content down on every visit, even though most user
 * visits are read-only. Hiding it behind a dialog keeps the page
 * light without losing the affordance.
 *
 * The dialog itself filters available roles by selected org and
 * pivots on the role's scope :
 *  - Built-in `ADMIN` (Role.organizationId is null) is assignable at
 *    platform tier (orgId null) or the org. The org auto-resolves to
 *    the singleton.
 *  - Custom roles (Role.organizationId set) are assignable only within
 *    their owning org ; we hide them when a different org is selected
 *    to prevent invalid combinations.
 *
 * Single-tenant deploys never see the org picker — the singleton id
 * (from `bootstrapStatus.singletonOrganizationId`) is auto-pinned and
 * the role dropdown becomes the only field.
 */
export function AdminRoles({
  userId,
  assignments,
  disabled,
}: {
  userId: string;
  assignments: Assignment[];
  disabled?: boolean;
}) {
  const t = useTranslations("admin.users.roles");
  const utils = trpc.useUtils();

  const [dialogOpen, setDialogOpen] = useState(false);

  const revoke = trpc.rbac.adminRevokeRole.useMutation({
    onSuccess: () => {
      void utils.users.adminGetUser.invalidate({ userId });
      toast.success(t("revokeSuccess"));
    },
    onError: (error) => {
      toast.error(error.message || t("revokeError"));
    },
  });

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")}>
      {/*
          Inline flex-wrap of removable chips + a dashed outline "+
          Add new role" chip at the end. The empty state collapses to
          just the add chip so there's a single affordance to learn ;
          when assignments exist the add chip sits beside them,
          inheriting the same chip rhythm.
        */}
      <div className="flex flex-wrap gap-1.5">
        {assignments.map((assignment) => (
          <RoleChip
            key={assignment.id}
            name={assignment.role.name}
            color={assignment.role.color}
            onRemove={() => revoke.mutate({ assignmentId: assignment.id })}
            removeAriaLabel={t("revokeAria", { role: assignment.role.name })}
            removeDisabled={revoke.isPending || disabled}
          />
        ))}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3 w-3" aria-hidden />
          {t("addCta")}
        </button>
      </div>

      <AssignRoleDialog open={dialogOpen} onOpenChange={setDialogOpen} userId={userId} />
    </PageSection>
  );
}

/**
 * Dialog wrapper for the assign-role form. State (org / role
 * selections, in-flight mutation) is local to the dialog — opening
 * the dialog spins up a fresh form, closing wipes selections so the
 * next open starts clean. Submitting closes the dialog on success
 * via the mutation's `onSuccess` callback.
 */
function AssignRoleDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}) {
  const t = useTranslations("admin.users.roles");
  const utils = trpc.useUtils();

  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const singletonOrgId = status.data?.singletonOrganizationId ?? null;

  const [pendingOrgId, setPendingOrgId] = useState<string>("");
  const [pendingRoleId, setPendingRoleId] = useState<string>("");

  // Wipe selections every time the dialog opens and pin the singleton
  // org, so the form reduces to just the role picker.
  useEffect(() => {
    if (!open) return;
    setPendingOrgId(singletonOrgId ?? "");
    setPendingRoleId("");
  }, [open, singletonOrgId]);

  const rolesQuery = trpc.rbac.adminListRoles.useQuery(
    { organizationId: pendingOrgId },
    { enabled: open && pendingOrgId !== "", refetchOnWindowFocus: false },
  );

  const assign = trpc.rbac.adminAssignRole.useMutation({
    onSuccess: () => {
      void utils.users.adminGetUser.invalidate({ userId });
      toast.success(t("assignSuccess"));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || t("assignError"));
    },
  });

  const canSubmit = pendingRoleId !== "" && pendingOrgId !== "" && !assign.isPending;

  function onAdd() {
    if (!canSubmit) return;
    assign.mutate({ userId, roleId: pendingRoleId, organizationId: pendingOrgId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <label htmlFor="assign-role-select" className="text-sm font-medium">
              {t("roleLabel")}
            </label>
            <Select
              value={pendingRoleId}
              onValueChange={setPendingRoleId}
              disabled={pendingOrgId === ""}
            >
              <SelectTrigger id="assign-role-select" className="w-full">
                <SelectValue placeholder={t("rolePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(rolesQuery.data ?? []).map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assign.isPending}
          >
            {t("dialogCancel")}
          </Button>
          <Button type="button" onClick={onAdd} disabled={!canSubmit}>
            <Plus className="h-4 w-4" aria-hidden />
            {assign.isPending ? t("assigning") : t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
