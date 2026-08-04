"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Ban, Check, Copy, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog, PanelHeader } from "@/components/patterns";
import { DangerCard, DangerRow } from "@/components/danger-card";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";

const EXPIRY_PRESETS = ["never", "30", "90", "365"] as const;
type ExpiryPreset = (typeof EXPIRY_PRESETS)[number];
function expiryToIso(preset: ExpiryPreset): string | null {
  if (preset === "never") return null;
  const days = Number.parseInt(preset, 10);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export type ServiceAccount = {
  id: string;
  name: string;
  disabledAt: Date | string | null;
  createdAt: Date | string;
  createdBy: string | null;
  roleIds: string[];
  keyCount: number;
};

type MintedKey = { id: string; name: string; prefix: string; plaintext: string };

export function ServiceAccountPanel({
  account,
  onClose,
  onDeleted,
}: {
  account: ServiceAccount;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("admin.serviceAccounts");
  const tKeys = useTranslations("account.apiKeys");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const utils = trpc.useUtils();

  const disabled = Boolean(account.disabledAt);

  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<null | "disable" | "delete">(null);

  const rolesQuery = trpc.apiKeys.serviceAccounts.assignableRoles.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const roles = rolesQuery.data ?? [];
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set(account.roleIds));

  const keysQuery = trpc.apiKeys.serviceAccounts.keys.list.useQuery(
    { serviceAccountId: account.id },
    { refetchOnWindowFocus: false },
  );

  const invalidateAll = async () => {
    await Promise.all([
      utils.apiKeys.serviceAccounts.list.invalidate(),
      utils.apiKeys.serviceAccounts.keys.list.invalidate({ serviceAccountId: account.id }),
    ]);
  };

  const setRolesMutation = trpc.apiKeys.serviceAccounts.setRoles.useMutation({
    onSuccess: async () => {
      toast.success(t("roles.saveSuccess"));
      await utils.apiKeys.serviceAccounts.list.invalidate();
    },
    onError: (err) => toast.error(err.message || t("roles.saveError")),
  });

  const createKey = trpc.apiKeys.serviceAccounts.keys.create.useMutation({
    onSuccess: async (result) => {
      setCreateKeyOpen(false);
      setMinted(result);
      await invalidateAll();
    },
    onError: (err) => toast.error(err.message || tKeys("form.saveError")),
  });

  const revokeKey = trpc.apiKeys.serviceAccounts.keys.revoke.useMutation({
    onSuccess: async () => {
      toast.success(tKeys("revokeSuccess"));
      setConfirmRevoke(null);
      await invalidateAll();
    },
    onError: (err) => toast.error(err.message || tKeys("revokeError")),
  });

  const disableMutation = trpc.apiKeys.serviceAccounts.disable.useMutation({
    onSuccess: async () => {
      toast.success(t("disableSuccess"));
      setConfirm(null);
      await invalidateAll();
    },
    onError: (err) => toast.error(err.message || t("disableError")),
  });

  const deleteMutation = trpc.apiKeys.serviceAccounts.delete.useMutation({
    onSuccess: async () => {
      toast.success(t("deleteSuccess"));
      await utils.apiKeys.serviceAccounts.list.invalidate();
      onDeleted();
    },
    onError: (err) => toast.error(err.message || t("deleteError")),
  });

  const keys = keysQuery.data ?? [];
  const rolesDirty =
    roleIds.size !== account.roleIds.length || account.roleIds.some((id) => !roleIds.has(id));

  function toggleRole(id: string, checked: boolean) {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <>
      <PanelHeader title={account.name} onClose={onClose} />
      <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
        {/* Status */}
        <div className="flex items-center gap-2">
          <Badge variant={disabled ? "secondary" : "success"}>
            {disabled ? t("status.disabled") : t("status.active")}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t("createdAt", {
              time: formatRelativeTime(account.createdAt as unknown as string, locale),
            })}
          </span>
        </div>

        {/* Roles */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">{t("roles.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("roles.help")}</p>
          </div>
          {rolesQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("roles.empty")}</p>
          ) : (
            <div className="space-y-2">
              {roles.map((role) => {
                const id = `edit-role-${role.id}`;
                return (
                  <label
                    key={role.id}
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:border-primary/50"
                  >
                    <Checkbox
                      id={id}
                      checked={roleIds.has(role.id)}
                      onChange={(e) => toggleRole(role.id, e.target.checked)}
                    />
                    <span className="text-sm font-medium">{role.name}</span>
                    {role.builtIn && <Badge variant="secondary">{t("form.builtIn")}</Badge>}
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!rolesDirty || setRolesMutation.isPending}
              onClick={() => setRolesMutation.mutate({ id: account.id, roleIds: [...roleIds] })}
            >
              {setRolesMutation.isPending ? tCommon("loading") : t("roles.save")}
            </Button>
          </div>
        </section>

        {/* Keys */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t("keys.title")}</h3>
            <Button size="sm" onClick={() => setCreateKeyOpen(true)} disabled={disabled}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {t("keys.createCta")}
            </Button>
          </div>

          {keysQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : keys.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("keys.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {keys.map((key) => {
                const revoked = Boolean(key.revokedAt);
                const expired =
                  !revoked &&
                  key.expiresAt != null &&
                  new Date(key.expiresAt as unknown as string).getTime() <= Date.now();
                const status = revoked ? "revoked" : expired ? "expired" : "active";
                return (
                  <li key={key.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{key.name}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {key.prefix}…
                        </code>
                        <Badge
                          variant={
                            status === "active"
                              ? "success"
                              : status === "expired"
                                ? "warning"
                                : "secondary"
                          }
                        >
                          {tKeys(`status.${status}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {key.lastUsedAt
                          ? tKeys("lastUsed", {
                              time: formatRelativeTime(key.lastUsedAt as unknown as string, locale),
                            })
                          : tKeys("neverUsed")}
                      </p>
                    </div>
                    {!revoked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => setConfirmRevoke({ id: key.id, name: key.name })}
                        disabled={revokeKey.isPending}
                      >
                        {t("keys.revoke")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Danger zone */}
        <DangerCard title={t("danger.title")}>
          {!disabled && (
            <DangerRow
              title={t("danger.disableTitle")}
              description={t("danger.disableDescription")}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirm("disable")}
                  className="text-destructive hover:text-destructive"
                >
                  <Ban className="mr-1.5 h-4 w-4" aria-hidden />
                  {t("danger.disable")}
                </Button>
              }
            />
          )}
          <DangerRow
            title={t("danger.deleteTitle")}
            description={t("danger.deleteDescription")}
            action={
              <Button variant="destructive" size="sm" onClick={() => setConfirm("delete")}>
                {t("danger.delete")}
              </Button>
            }
          />
        </DangerCard>
      </div>

      <CreateKeyDialog
        open={createKeyOpen}
        onOpenChange={setCreateKeyOpen}
        pending={createKey.isPending}
        onSubmit={(input) => createKey.mutate({ serviceAccountId: account.id, ...input })}
      />

      <RevealKeyDialog minted={minted} onClose={() => setMinted(null)} />

      <ConfirmDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revokeKey.isPending) setConfirmRevoke(null);
        }}
        title={tKeys("revokeDialog.title")}
        description={tKeys("revokeDialog.description", { name: confirmRevoke?.name ?? "" })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={tKeys("revokeDialog.confirm")}
        isPending={revokeKey.isPending}
        onConfirm={() => {
          if (confirmRevoke) {
            revokeKey.mutate({ serviceAccountId: account.id, keyId: confirmRevoke.id });
          }
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !disableMutation.isPending && !deleteMutation.isPending) setConfirm(null);
        }}
        title={
          confirm === "delete" ? t("danger.deleteDialogTitle") : t("danger.disableDialogTitle")
        }
        description={
          confirm === "delete"
            ? t("danger.deleteDialogDescription", { name: account.name })
            : t("danger.disableDialogDescription", { name: account.name })
        }
        cancelLabel={tCommon("cancel")}
        confirmLabel={confirm === "delete" ? t("danger.delete") : t("danger.disable")}
        isPending={disableMutation.isPending || deleteMutation.isPending}
        onConfirm={() => {
          if (confirm === "delete") deleteMutation.mutate({ id: account.id });
          else if (confirm === "disable") disableMutation.mutate({ id: account.id });
        }}
      />
    </>
  );
}

// ── Mint dialog (reuses the account-namespace scope/expiry copy) ──────
function CreateKeyDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (input: { name: string; expiresAt: string | null }) => void;
}) {
  const t = useTranslations("admin.serviceAccounts");
  const tKeys = useTranslations("account.apiKeys");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryPreset>("never");

  function handleOpenChange(next: boolean) {
    if (!next && !pending) {
      setName("");
      setExpiry("never");
    }
    onOpenChange(next);
  }

  const canSubmit = name.trim().length > 0 && !pending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("keys.formTitle")}</DialogTitle>
          <DialogDescription>{t("keys.formDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sa-key-name">{tKeys("form.nameLabel")}</Label>
            <Input
              id="sa-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tKeys("form.namePlaceholder")}
              maxLength={100}
              autoFocus
            />
          </div>

          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {t("keys.rightsNote")}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="sa-key-expiry">{tKeys("form.expiryLabel")}</Label>
            <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryPreset)}>
              <SelectTrigger id="sa-key-expiry" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {tKeys(`form.expiry.${preset}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={() => onSubmit({ name: name.trim(), expiresAt: expiryToIso(expiry) })}
            disabled={!canSubmit}
          >
            {pending ? tCommon("loading") : tKeys("form.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reveal dialog (plaintext shown once) ─────────────────────────────
function RevealKeyDialog({ minted, onClose }: { minted: MintedKey | null; onClose: () => void }) {
  const tKeys = useTranslations("account.apiKeys");
  const tCommon = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.plaintext);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tKeys("reveal.copyError"));
    }
  }

  return (
    <Dialog
      open={minted !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tKeys("reveal.title", { name: minted?.name ?? "" })}</DialogTitle>
          <DialogDescription>{tKeys("reveal.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>{tKeys("reveal.warning")}</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
              {minted?.plaintext}
            </code>
            <Button type="button" variant="secondary" onClick={copy} className="shrink-0">
              {copied ? (
                <Check className="mr-1.5 h-4 w-4" aria-hidden />
              ) : (
                <Copy className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              {copied ? tKeys("reveal.copied") : tKeys("reveal.copy")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setCopied(false);
              onClose();
            }}
          >
            {tCommon("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
