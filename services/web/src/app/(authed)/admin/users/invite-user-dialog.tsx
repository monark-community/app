"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

/**
 * Dialog launched from the admin users list to send a new invite. The
 * underlying tRPC mutation requires an `organizationId` ; in
 * resolve that from `bootstrapStatus` (the singleton id is exposed
 * there) so the operator never sees a picker.
 *
 * Role options come from `rbac.adminListRoles` against the chosen org
 * — built-in `ADMIN` plus every custom role the org has defined via
 * /admin/rbac. The dropdown re-fetches when the org pick changes so
 * cross-org role assignments aren't even displayable.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.users.invite");
  const utils = trpc.useUtils();

  const status = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const singletonId = status.data?.singletonOrganizationId ?? null;

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [orgId, setOrgId] = useState("");

  // The app serves one organization, so the invite is always scoped to
  // the singleton ; pin it rather than asking the admin to pick.
  useEffect(() => {
    if (singletonId) setOrgId(singletonId);
  }, [singletonId]);

  // Roles available within the chosen org : built-in ADMIN +
  // org-scoped custom roles. Re-fetches when `orgId` changes ; until
  // an org is picked, stays disabled.
  const rolesQuery = trpc.rbac.adminListRoles.useQuery(
    { organizationId: orgId },
    { enabled: orgId !== "", refetchOnWindowFocus: false },
  );

  const create = trpc.organizations.invites.adminCreate.useMutation({
    onSuccess: () => {
      void utils.organizations.invites.adminListAll.invalidate();
      toast.success(t("success"));
      // Wipe state on close so the dialog doesn't reopen with stale
      // values next time.
      setEmail("");
      setDisplayName("");
      setRoleId("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message || t("error"));
    },
  });

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  const canSubmit = emailValid && roleId !== "" && orgId !== "" && !create.isPending;

  function onSubmit() {
    if (!canSubmit) return;
    create.mutate({
      organizationId: orgId,
      email: email.trim().toLowerCase(),
      displayName: displayName.trim() || undefined,
      roleId,
      appUrl: typeof window !== "undefined" ? window.location.origin : undefined,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Soft reset on close so a re-open starts clean. We don't
        // touch `orgId` since it auto-resolves to the singleton.
        if (!next) {
          setEmail("");
          setDisplayName("");
          setRoleId("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor="invite-name">{t("nameLabel")}</Label>
            <Input
              id="invite-name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={120}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t("nameHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-email">{t("emailLabel")}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("emailPlaceholder")}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">{t("roleLabel")}</Label>
            <Select value={roleId} onValueChange={setRoleId} disabled={orgId === ""}>
              <SelectTrigger id="invite-role" className="w-full">
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
            disabled={create.isPending}
          >
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!canSubmit}>
            {create.isPending ? t("sending") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
