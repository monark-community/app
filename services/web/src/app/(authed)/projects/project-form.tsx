"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export type ProjectFormInitial = {
  id: string;
  title: string;
  slug: string;
  url: string | null;
  description: string | null;
  publicStatus: "IDEA" | "PROTOTYPE_AVAILABLE" | "IN_PROGRESS" | "QA" | "COMPLETED";
  keywords: string[];
  industries: Array<{ id: string; displayName: string }>;
};

const STATUS_OPTIONS = ["IDEA", "PROTOTYPE_AVAILABLE", "IN_PROGRESS", "QA", "COMPLETED"] as const;

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

export function ProjectForm({
  mode,
  initial,
  onClose,
  containment = "viewport",
}: {
  mode: "create" | "edit";
  initial?: ProjectFormInitial;
  onClose?: () => void;
  /** `"container"` when rendered inside a detail panel, so the save bar
   *  anchors to the panel ; `"viewport"` (default) on the full page. */
  containment?: "viewport" | "container";
}) {
  const t = useTranslations("admin.projects.form");
  const tCommon = useTranslations("common");
  const tFields = useTranslations("admin.projects.form.fields");
  const tStatus = useTranslations("admin.projects.status");
  const router = useRouter();
  const utils = trpc.useUtils();

  const handleClose = onClose ?? (() => router.push("/projects"));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [publicStatus, setPublicStatus] = useState<(typeof STATUS_OPTIONS)[number]>(
    initial?.publicStatus ?? "IDEA",
  );
  const [keywordsRaw, setKeywordsRaw] = useState((initial?.keywords ?? []).join(", "));
  const [industries, setIndustries] = useState(initial?.industries ?? []);
  const [industriesPopoverOpen, setIndustriesPopoverOpen] = useState(false);
  const [industrySearch, setIndustrySearch] = useState("");

  const slugPreview = useMemo(() => {
    if (slug.trim().length > 0) return slug.trim();
    const derived = slugify(title);
    return derived;
  }, [title, slug]);

  const industriesQuery = trpc.projects.industries.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const selectedIds = new Set(industries.map((i) => i.id));
  const filteredAvailable = (industriesQuery.data ?? []).filter((ind) => {
    if (selectedIds.has(ind.id)) return false;
    if (industrySearch.trim().length === 0) return true;
    return ind.displayName.toLowerCase().includes(industrySearch.trim().toLowerCase());
  });

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      toast.success(t("createSuccess"));
      void utils.projects.list.invalidate();
      handleClose();
    },
    onError: (err) => {
      toast.error(t("createError", { message: err.message }));
    },
  });

  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      void utils.projects.list.invalidate();
      if (initial) {
        void utils.projects.getById.invalidate({ id: initial.id });
      }
    },
    onError: (err) => {
      toast.error(t("updateError", { message: err.message }));
    },
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  function parseKeywords(raw: string): string[] {
    return Array.from(
      new Set(
        raw
          .split(/[,\n]/)
          .map((k) => k.trim().toLowerCase())
          .filter((k) => k.length > 0 && k.length <= 40),
      ),
    ).slice(0, 50);
  }

  function submit() {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      toast.error(t("validationTitle"));
      return;
    }
    const trimmedUrl = url.trim();
    if (trimmedUrl.length > 0) {
      try {
        const parsed = new URL(trimmedUrl);
        if (!parsed.protocol.startsWith("http")) {
          throw new Error("non-http");
        }
      } catch {
        toast.error(t("validationUrl"));
        return;
      }
    }
    const payload = {
      title: trimmedTitle,
      slug: slug.trim().length > 0 ? slug.trim() : undefined,
      url: trimmedUrl.length > 0 ? trimmedUrl : null,
      description: description.trim().length > 0 ? description : null,
      publicStatus,
      keywords: parseKeywords(keywordsRaw),
      industryIds: industries.map((i) => i.id),
    };
    if (mode === "create") {
      createMutation.mutate(payload);
    } else if (initial) {
      updateMutation.mutate({ id: initial.id, ...payload });
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  // Dirty vs the loaded baseline (edit) or the empty form (create). Drives
  // the save bar : it only slides in once something actually changed.
  const dirty = useMemo(() => {
    const currentKeywords = parseKeywords(keywordsRaw);
    const currentIndustryIds = industries.map((i) => i.id);
    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v) => b.includes(v));
    if (mode === "edit") {
      if (!initial) return false;
      return (
        title.trim() !== initial.title ||
        slug.trim() !== initial.slug ||
        (url.trim() || null) !== (initial.url ?? null) ||
        (description.trim() || null) !== (initial.description ?? null) ||
        publicStatus !== initial.publicStatus ||
        !sameSet(currentKeywords, initial.keywords) ||
        !sameSet(
          currentIndustryIds,
          initial.industries.map((i) => i.id),
        )
      );
    }
    return (
      title.trim() !== "" ||
      slug.trim() !== "" ||
      url.trim() !== "" ||
      description.trim() !== "" ||
      keywordsRaw.trim() !== "" ||
      currentIndustryIds.length > 0 ||
      publicStatus !== "IDEA"
    );
  }, [mode, initial, title, slug, url, description, publicStatus, keywordsRaw, industries]);

  // Cancel = revert to baseline (not close). Closing the panel is the
  // header's job ; the operator opened this bar to decide save-or-discard.
  function revert() {
    setTitle(initial?.title ?? "");
    setSlug(initial?.slug ?? "");
    setUrl(initial?.url ?? "");
    setDescription(initial?.description ?? "");
    setPublicStatus(initial?.publicStatus ?? "IDEA");
    setKeywordsRaw((initial?.keywords ?? []).join(", "));
    setIndustries(initial?.industries ?? []);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 pb-20">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "create" ? t("createTitle") : t("editTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "create" ? t("createSubtitle") : t("editSubtitle")}
        </p>
      </header>

      <div className="space-y-1.5">
        <Label htmlFor="title">{tFields("title")}</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
        />
        <p className="text-xs text-muted-foreground">{tFields("titleHelp")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">{tFields("slug")}</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={slugPreview}
          maxLength={60}
        />
        <p className="text-xs text-muted-foreground">{tFields("slugHelp")}</p>
        {slugPreview.length > 0 && slug.trim().length === 0 && (
          <p className="text-xs text-muted-foreground">
            {tFields("slugPreview", { slug: slugPreview })}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="url">{tFields("url")}</Label>
        <Input
          id="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={tFields("urlPlaceholder")}
          inputMode="url"
        />
        <p className="text-xs text-muted-foreground">{tFields("urlHelp")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{tFields("description")}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          maxLength={10_000}
        />
        <p className="text-xs text-muted-foreground">{tFields("descriptionHelp")}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="publicStatus">{tFields("publicStatus")}</Label>
        <Select
          value={publicStatus}
          onValueChange={(v) => setPublicStatus(v as (typeof STATUS_OPTIONS)[number])}
        >
          <SelectTrigger id="publicStatus" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {tStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="keywords">{tFields("keywords")}</Label>
        <Input
          id="keywords"
          value={keywordsRaw}
          onChange={(e) => setKeywordsRaw(e.target.value)}
          placeholder={tFields("keywordsPlaceholder")}
        />
        <p className="text-xs text-muted-foreground">{tFields("keywordsHelp")}</p>
      </div>

      <div className="space-y-2">
        <Label>{tFields("industries")}</Label>
        <p className="text-xs text-muted-foreground">{tFields("industriesHelp")}</p>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border p-2 min-h-11">
          {industries.length === 0 && (
            <span className="px-1 text-xs text-muted-foreground">{t("noIndustries")}</span>
          )}
          {industries.map((ind) => (
            <Badge key={ind.id} variant="secondary" className="gap-1 pl-2 pr-1">
              <span>{ind.displayName}</span>
              <button
                type="button"
                onClick={() => setIndustries((cur) => cur.filter((i) => i.id !== ind.id))}
                className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-sm hover:bg-foreground/10"
                aria-label={t("removeIndustry", { name: ind.displayName })}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
          ))}
          <Popover
            open={industriesPopoverOpen}
            onOpenChange={(open) => {
              setIndustriesPopoverOpen(open);
              if (!open) setIndustrySearch("");
            }}
          >
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                <Plus className="h-3 w-3" aria-hidden />
                {t("addIndustry")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              <Input
                value={industrySearch}
                onChange={(e) => setIndustrySearch(e.target.value)}
                placeholder={t("industriesSearchPlaceholder")}
                className="mb-2"
                autoFocus
              />
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {filteredAvailable.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {t("industriesEmpty")}
                  </p>
                ) : (
                  filteredAvailable.map((ind) => (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => {
                        setIndustries((cur) => [
                          ...cur,
                          { id: ind.id, displayName: ind.displayName },
                        ]);
                        setIndustrySearch("");
                      }}
                      className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span>{ind.displayName}</span>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <DirtyFormBar
        containment={containment}
        open={dirty}
        saving={isBusy}
        onSave={submit}
        onCancel={revert}
        saveLabel={mode === "create" ? t("create") : t("save")}
        savingLabel={mode === "create" ? t("creating") : t("saving")}
        cancelLabel={t("cancel")}
        message={tCommon("unsavedChanges")}
      />
    </form>
  );
}
