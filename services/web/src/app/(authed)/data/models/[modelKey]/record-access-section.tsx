"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

/**
 * Per-record role access (row-level authorization). Admin-only : deciding who
 * can see a record is a data-admin action, and the `records.getAccess` /
 * `setAccess` procedures + `rbac.adminListRoles` all require an admin. An empty
 * selection means the record is open to everyone who can access the model ;
 * picking roles restricts it to those roles (plus admins, who bypass).
 *
 * Mirrors the calendar role picker (checkbox list of the org's roles).
 */
export function RecordAccessSection({
  recordId,
  organizationId,
}: {
  recordId: string;
  organizationId: string;
}) {
  const t = useTranslations("data.records.access");
  const utils = trpc.useUtils();

  const { data: isAdmin } = trpc.rbac.isAdmin.useQuery();
  const enabled = isAdmin === true;
  const rolesQuery = trpc.rbac.adminListRoles.useQuery({ organizationId }, { enabled });
  const accessQuery = trpc.dataModels.records.getAccess.useQuery({ id: recordId }, { enabled });

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (accessQuery.data) setSelected(accessQuery.data.roleIds);
  }, [accessQuery.data]);

  const setAccess = trpc.dataModels.records.setAccess.useMutation({
    onSuccess: () => {
      toast.success(t("success"));
      utils.dataModels.records.getAccess.invalidate({ id: recordId });
      utils.dataModels.records.list.invalidate();
    },
    onError: (err) => toast.error(t("error") + ` (${err.message})`),
  });

  if (!enabled) return null;

  const roles: Array<{ id: string; name: string }> = rolesQuery.data ?? [];
  const current = accessQuery.data?.roleIds ?? [];
  const dirty = selected.length !== current.length || selected.some((id) => !current.includes(id));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  const loading = accessQuery.isLoading || rolesQuery.isLoading;

  return (
    <div className="mt-8 space-y-3">
      <Separator />
      <div>
        <h3 className="text-sm font-medium">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">
          {selected.length === 0 ? t("openHint") : t("restrictedHint")}
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : roles.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noRoles")}</p>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border border-input p-2">
          {roles.map((role) => (
            <label
              key={role.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={selected.includes(role.id)}
                onChange={() => toggle(role.id)}
              />
              {role.name}
            </label>
          ))}
        </div>
      )}

      <Button
        size="sm"
        disabled={!dirty || setAccess.isPending}
        onClick={() => setAccess.mutate({ id: recordId, roleIds: selected })}
      >
        {setAccess.isPending ? t("saving") : t("save")}
      </Button>
    </div>
  );
}
