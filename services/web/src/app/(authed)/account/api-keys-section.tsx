"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Braces, Check, Copy, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  ConfirmDialog,
  GroupedMultiSelect,
  type GroupedMultiSelectGroup,
} from "@/components/patterns";
import { PageSection } from "@/components/page-section";
import { formatRelativeTime } from "@/lib/format-time";
import { trpc } from "@/lib/trpc";

// Expiry presets offered in the create form ; "never" maps to null.
const EXPIRY_PRESETS = ["never", "30", "90", "365"] as const;
type ExpiryPreset = (typeof EXPIRY_PRESETS)[number];

function expiryToIso(preset: ExpiryPreset): string | null {
  if (preset === "never") return null;
  const days = Number.parseInt(preset, 10);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// The API origin is build-time public config ; `/api/v1` is the mounted base.
// Falls back to a readable placeholder when the deploy hasn't set it.
const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "https://<your-monark-host>"}/api/v1`;

type MintedKey = { id: string; name: string; prefix: string; plaintext: string };

export function ApiKeysSection() {
  const t = useTranslations("account.apiKeys");
  const tCommon = useTranslations("common");
  const tCat = useTranslations("admin.rbac.editor");
  const locale = useLocale();
  const utils = trpc.useUtils();

  const permsQuery = trpc.rbac.myPermissions.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const canManage = (permsQuery.data ?? []).includes("api-keys.manage");

  const listQuery = trpc.apiKeys.list.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });

  // Whether /api/v1 is actually live for this org — a key is useless until the
  // operator flips `public-api.enabled`, so we say so rather than let a new key
  // mysteriously 404.
  const flagsQuery = trpc.featureFlags.getAllForSession.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const apiEnabled = flagsQuery.data?.["public-api.enabled"] === true;

  // The permissions the caller can grant to a key (their own current authority),
  // grouped by category. Feeds the "Limited access" picker and the dead-entry
  // indicator (an allowlist permission the owner no longer holds).
  const grantableQuery = trpc.rbac.myGrantablePermissions.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const grantable = useMemo(() => grantableQuery.data?.categories ?? [], [grantableQuery.data]);
  const heldSet = useMemo(
    () => new Set(grantable.flatMap((c) => c.permissions.map((p) => p.key))),
    [grantable],
  );
  const permissionGroups = useMemo<GroupedMultiSelectGroup[]>(
    () =>
      grantable.map((c) => ({
        key: c.category,
        label: tCat(`categories.${c.category}` as const),
        items: c.permissions.map((p) => ({
          value: p.key,
          primary: p.key,
          secondary: p.description,
        })),
      })),
    [grantable, tCat],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<{ id: string; name: string } | null>(null);

  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: async (result) => {
      setCreateOpen(false);
      setMinted(result);
      await utils.apiKeys.list.invalidate();
    },
    onError: (err) => toast.error(err.message || t("form.saveError")),
  });

  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: async () => {
      toast.success(t("revokeSuccess"));
      setConfirmRevoke(null);
      await utils.apiKeys.list.invalidate();
    },
    onError: (err) => toast.error(err.message || t("revokeError")),
  });

  const keys = listQuery.data ?? [];

  return (
    <PageSection title={t("title")} subtitle={t("subtitle")} contentClassName="space-y-4">
      {!canManage ? (
        <p className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {t("noPermission")}
        </p>
      ) : (
        <>
          {flagsQuery.data && !apiEnabled && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span>{t("apiDisabled")}</span>
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {t("createCta")}
            </Button>
          </div>

          {listQuery.isLoading && (
            <div className="space-y-2 rounded-md border border-border" aria-busy="true">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-md" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          )}

          {listQuery.isError && <p className="text-sm text-destructive">{t("loadError")}</p>}

          {!listQuery.isLoading && !listQuery.isError && keys.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          )}

          {keys.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {keys.map((key) => {
                const isRevoked = Boolean(key.revokedAt);
                const isExpired =
                  !isRevoked &&
                  key.expiresAt != null &&
                  new Date(key.expiresAt as unknown as string).getTime() <= Date.now();
                const status = isRevoked ? "revoked" : isExpired ? "expired" : "active";
                // Allowlist entries the owner no longer holds — only computed
                // once the grantable set has loaded, so we don't false-flag.
                const deadCount =
                  !key.fullAccess && grantableQuery.data != null
                    ? key.permissions.filter((p) => !heldSet.has(p)).length
                    : 0;
                return (
                  <li key={key.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Braces className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </span>
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
                            {t(`status.${status}`)}
                          </Badge>
                          <Badge variant="secondary" className="font-normal">
                            {key.fullAccess
                              ? t("access.full")
                              : t("access.limited", { count: key.permissions.length })}
                          </Badge>
                          {deadCount > 0 && (
                            <Badge variant="warning" className="font-normal">
                              {t("access.dead", { count: deadCount })}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("createdAt", {
                            time: formatRelativeTime(key.createdAt as unknown as string, locale),
                          })}
                          {" · "}
                          {key.lastUsedAt
                            ? t("lastUsed", {
                                time: formatRelativeTime(
                                  key.lastUsedAt as unknown as string,
                                  locale,
                                ),
                              })
                            : t("neverUsed")}
                          {key.expiresAt && !isRevoked
                            ? ` · ${t("expiresAt", {
                                time: formatRelativeTime(
                                  key.expiresAt as unknown as string,
                                  locale,
                                ),
                              })}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    {!isRevoked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => setConfirmRevoke({ id: key.id, name: key.name })}
                        disabled={revokeMutation.isPending}
                      >
                        {t("revoke")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm">
            <p className="font-medium">{t("usage.title")}</p>
            <p className="text-muted-foreground">{t("usage.intro")}</p>
            <dl className="space-y-1.5 pt-1">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <dt className="w-32 shrink-0 text-xs text-muted-foreground">
                  {t("usage.baseUrlLabel")}
                </dt>
                <dd>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {API_BASE}
                  </code>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <dt className="w-32 shrink-0 text-xs text-muted-foreground">
                  {t("usage.openApiLabel")}
                </dt>
                <dd>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {API_BASE}/openapi.json
                  </code>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                <dt className="w-32 shrink-0 text-xs text-muted-foreground">
                  {t("usage.exampleLabel")}
                </dt>
                <dd className="min-w-0">
                  <code className="block overflow-x-auto whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    curl -H &quot;Authorization: Bearer mrk_…&quot; {API_BASE}/me
                  </code>
                </dd>
              </div>
            </dl>
          </div>
        </>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        pending={createMutation.isPending}
        groups={permissionGroups}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <RevealKeyDialog
        minted={minted}
        onClose={() => setMinted(null)}
        copyLabel={t("reveal.copy")}
        copiedLabel={t("reveal.copied")}
        copyError={t("reveal.copyError")}
      />

      <ConfirmDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revokeMutation.isPending) setConfirmRevoke(null);
        }}
        title={t("revokeDialog.title")}
        description={t("revokeDialog.description", { name: confirmRevoke?.name ?? "" })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("revokeDialog.confirm")}
        isPending={revokeMutation.isPending}
        onConfirm={() => {
          if (confirmRevoke) revokeMutation.mutate({ id: confirmRevoke.id });
        }}
      />
    </PageSection>
  );
}

// ── Create dialog ────────────────────────────────────────────────────
function CreateKeyDialog({
  open,
  onOpenChange,
  pending,
  groups,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  groups: GroupedMultiSelectGroup[];
  onSubmit: (input: {
    name: string;
    expiresAt: string | null;
    fullAccess: boolean;
    permissions: string[];
  }) => void;
}) {
  const t = useTranslations("account.apiKeys");
  const tCat = useTranslations("admin.rbac.editor");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryPreset>("never");
  const [mode, setMode] = useState<"full" | "limited">("full");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset the form whenever the dialog closes so a re-open starts clean.
  function handleOpenChange(next: boolean) {
    if (!next && !pending) {
      setName("");
      setExpiry("never");
      setMode("full");
      setSelected(new Set());
    }
    onOpenChange(next);
  }

  function toggle(value: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  const canSubmit = name.trim().length > 0 && !pending && (mode === "full" || selected.size > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("form.title")}</DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto py-2">
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name">{t("form.nameLabel")}</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
              maxLength={100}
              autoFocus
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("form.accessLabel")}</legend>
            {(["full", "limited"] as const).map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:border-primary/50"
              >
                <input
                  type="radio"
                  name="api-key-access"
                  className="mt-0.5 accent-primary"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{t(`form.access_${m}`)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`form.access_${m}_hint`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === "limited" && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("form.permsHelp")}</p>
              <GroupedMultiSelect
                groups={groups}
                isChecked={(value) => selected.has(value)}
                onToggleItem={(_g, value, next) => toggle(value, next)}
                onToggleGroup={(group, selectAll) =>
                  group.items.forEach((it) => toggle(it.value, selectAll))
                }
                labels={{
                  searchPlaceholder: tCat("searchPlaceholder"),
                  searchAria: tCat("searchAria"),
                  toggleAllAria: (g) => tCat("toggleAllAria", { category: g }),
                }}
                renderEmpty={() => (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    {groups.length === 0 ? t("form.permsEmpty") : t("form.permsSearchEmpty")}
                  </p>
                )}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="api-key-expiry">{t("form.expiryLabel")}</Label>
            <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryPreset)}>
              <SelectTrigger id="api-key-expiry" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_PRESETS.map((preset) => (
                  <SelectItem key={preset} value={preset}>
                    {t(`form.expiry.${preset}`)}
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
            onClick={() =>
              onSubmit({
                name: name.trim(),
                expiresAt: expiryToIso(expiry),
                fullAccess: mode === "full",
                permissions: mode === "full" ? [] : [...selected],
              })
            }
            disabled={!canSubmit}
          >
            {pending ? tCommon("loading") : t("form.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reveal dialog (plaintext shown exactly once) ─────────────────────
function RevealKeyDialog({
  minted,
  onClose,
  copyLabel,
  copiedLabel,
  copyError,
}: {
  minted: MintedKey | null;
  onClose: () => void;
  copyLabel: string;
  copiedLabel: string;
  copyError: string;
}) {
  const t = useTranslations("account.apiKeys");
  const tCommon = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.plaintext);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(copyError);
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
          <DialogTitle>{t("reveal.title", { name: minted?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("reveal.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>{t("reveal.warning")}</span>
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
              {copied ? copiedLabel : copyLabel}
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
