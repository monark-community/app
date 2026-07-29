"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DangerCard, DangerRow } from "@/components/danger-card";
import { ConfirmDialog, FieldRow } from "@/components/patterns";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { trpc } from "@/lib/trpc";

// Env-var-style name: a letter/underscore, then letters, digits, underscores.
// Mirrors the server's `SECRET_KEY` zod schema for instant client feedback.
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

type SecretFormProps = {
  mode: "create" | "edit";
  /** The selected secret's metadata (edit mode only). The value is never fetched. */
  secret?: { key: string; description: string | null };
  /** Whether the caller may mutate (secrets.manage). Read-only view otherwise. */
  canManage: boolean;
  /** Close the panel (called after a successful create / update / delete). */
  onClose: () => void;
};

export function SecretForm({ mode, secret, canManage, onClose }: SecretFormProps) {
  const t = useTranslations("admin.secrets.form");
  const tCommon = useTranslations("common");
  const utils = trpc.useUtils();

  const isEdit = mode === "edit";
  const [key, setKey] = useState(secret?.key ?? "");
  // Write-only: the value box starts empty even in edit mode (the plaintext is
  // never read back). A blank value on save leaves the stored value untouched.
  const [value, setValue] = useState("");
  const [description, setDescription] = useState(secret?.description ?? "");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const setMutation = trpc.secrets.adminSet.useMutation({
    onSuccess: async () => {
      toast.success(isEdit ? t("updateSuccess") : t("createSuccess"));
      await utils.secrets.adminList.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message || t("saveError")),
  });

  const deleteMutation = trpc.secrets.adminDelete.useMutation({
    onSuccess: async () => {
      toast.success(t("deleteSuccess"));
      await utils.secrets.adminList.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message || t("deleteError")),
  });

  const baseDescription = secret?.description ?? "";
  const dirty = useMemo(() => {
    if (!canManage) return false;
    if (isEdit) return value !== "" || description.trim() !== baseDescription.trim();
    // Create: dirty once any field is touched.
    return key.trim() !== "" || value !== "" || description.trim() !== "";
  }, [canManage, isEdit, key, value, description, baseDescription]);

  function onCancel() {
    setKey(secret?.key ?? "");
    setValue("");
    setDescription(secret?.description ?? "");
  }

  function onSave() {
    if (!isEdit) {
      const trimmedKey = key.trim();
      if (!KEY_RE.test(trimmedKey)) {
        toast.error(t("invalidKey"));
        return;
      }
      if (value === "") {
        toast.error(t("valueRequired"));
        return;
      }
    }
    setMutation.mutate({
      key: isEdit ? (secret?.key ?? "") : key.trim(),
      // Omit the value on an edit that didn't set a new one (keeps the stored one).
      value: value === "" ? undefined : value,
      description: description.trim() === "" ? null : description.trim(),
    });
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="@container space-y-5">
        <FieldRow label={t("keyLabel")} htmlFor="secret-key">
          {isEdit ? (
            <p className="font-mono text-sm">{secret?.key}</p>
          ) : (
            <>
              <Input
                id="secret-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t("keyPlaceholder")}
                maxLength={100}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono"
                disabled={!canManage}
              />
              <p className="text-xs text-muted-foreground">{t("keyHint")}</p>
            </>
          )}
        </FieldRow>

        <FieldRow label={t("valueLabel")} htmlFor="secret-value">
          <Input
            id="secret-value"
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isEdit ? t("valuePlaceholderEdit") : t("valuePlaceholderCreate")}
            maxLength={8192}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            disabled={!canManage}
          />
          <p className="text-xs text-muted-foreground">
            {isEdit ? t("valueHintEdit") : t("valueHintCreate")}
          </p>
        </FieldRow>

        <FieldRow label={t("descriptionLabel")} htmlFor="secret-description">
          <Textarea
            id="secret-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
            maxLength={500}
            rows={3}
            disabled={!canManage}
          />
        </FieldRow>
      </div>

      {isEdit && canManage && (
        <DangerCard title={t("dangerTitle")}>
          <DangerRow
            title={t("deleteRowTitle")}
            description={t("deleteRowDescription")}
            action={
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={deleteMutation.isPending}
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
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmDescription", { key: secret?.key ?? "" })}
        cancelLabel={t("cancel")}
        confirmLabel={t("deleteCta")}
        isPending={deleteMutation.isPending}
        onConfirm={() => secret?.key && deleteMutation.mutate({ key: secret.key })}
      />

      <DirtyFormBar
        containment="container"
        open={dirty}
        onSave={onSave}
        onCancel={onCancel}
        saving={setMutation.isPending}
        saveLabel={isEdit ? t("save") : t("create")}
        savingLabel={t("saving")}
        cancelLabel={t("cancel")}
        message={tCommon("unsavedChanges")}
      />
    </div>
  );
}
