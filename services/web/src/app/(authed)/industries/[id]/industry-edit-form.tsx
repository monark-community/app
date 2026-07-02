"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function IndustryEditForm({
  id,
  initialDisplayName,
  initialSlug,
}: {
  id: string;
  initialDisplayName: string;
  initialSlug: string;
}) {
  const t = useTranslations("admin.industries.form");
  const tCommon = useTranslations("common");
  const utils = trpc.useUtils();

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [slugOverride, setSlugOverride] = useState(initialSlug);

  const slugPreview = useMemo(() => {
    const trimmed = slugOverride.trim();
    if (trimmed.length > 0) return trimmed;
    return slugify(displayName) || "";
  }, [displayName, slugOverride]);

  const updateMutation = trpc.projects.industries.update.useMutation({
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      utils.projects.industries.list.invalidate();
    },
    onError: (err) => toast.error(t("updateError", { message: err.message })),
  });

  function submit() {
    const name = displayName.trim();
    if (!name) return;
    updateMutation.mutate({ id, displayName: name, slug: slugOverride.trim() || undefined });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  const dirty = displayName.trim() !== initialDisplayName || slugOverride.trim() !== initialSlug;

  function revert() {
    setDisplayName(initialDisplayName);
    setSlugOverride(initialSlug);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle")}</h1>
      </header>

      <div className="space-y-1.5">
        <Label htmlFor="ind-name">{t("displayName")}</Label>
        <Input
          id="ind-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Fintech"
          required
          autoFocus
        />
        <p className="text-xs text-muted-foreground">{t("displayNameHelp")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ind-slug">{t("slug")}</Label>
        <Input
          id="ind-slug"
          value={slugOverride}
          onChange={(e) => setSlugOverride(e.target.value.toLowerCase())}
          placeholder={slugPreview || "fintech"}
        />
        {slugPreview && (
          <p className="text-xs text-muted-foreground">{t("slugPreview", { slug: slugPreview })}</p>
        )}
        <p className="text-xs text-muted-foreground">{t("slugHelp")}</p>
      </div>

      <DirtyFormBar
        open={dirty}
        saving={updateMutation.isPending}
        onSave={submit}
        onCancel={revert}
        saveLabel={t("save")}
        savingLabel={t("saving")}
        cancelLabel={t("cancel")}
        message={tCommon("unsavedChanges")}
      />
    </form>
  );
}
