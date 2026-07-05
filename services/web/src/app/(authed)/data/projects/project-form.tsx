"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DiscussionSection,
  FieldRow,
  MultiSelect,
  PageSection,
  useDiscussionPreview,
} from "@/components/patterns";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { FIELD_TYPE_ICON } from "@/components/fields";
import { RichTextEditor } from "@/components/fields/inputs/rich-text-editor";
import { useFieldStrings } from "@/components/fields/strings";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** Form field keys, in a stable set the list screen orders against. */
export type ProjectFieldKey =
  | "title"
  | "slug"
  | "url"
  | "publicStatus"
  | "keywords"
  | "industries"
  | "description";

/** The reorderable attribute keys — everything except the description, which
 *  now lives in its own "Description" section rather than the attributes list. */
type AttributeKey = Exclude<ProjectFieldKey, "description">;

/** Fallback order (full-page / no table layout). Description stays last. */
const DEFAULT_FIELD_ORDER: ProjectFieldKey[] = [
  "title",
  "slug",
  "publicStatus",
  "url",
  "keywords",
  "industries",
  "description",
];

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

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

export function ProjectForm({
  mode,
  initial,
  onClose,
  containment = "viewport",
  fieldOrder,
}: {
  mode: "create" | "edit";
  initial?: ProjectFormInitial;
  onClose?: () => void;
  /** `"container"` when rendered inside a detail panel, so the save bar
   *  anchors to the panel ; `"viewport"` (default) on the full page. */
  containment?: "viewport" | "container";
  /** Field render order — set by the list screen to mirror the table's
   *  configured column order. Falls back to {@link DEFAULT_FIELD_ORDER}. */
  fieldOrder?: ProjectFieldKey[];
}) {
  const t = useTranslations("admin.projects.form");
  const tCommon = useTranslations("common");
  const tSection = useTranslations("dataForm");
  const tFields = useTranslations("admin.projects.form.fields");
  const tStatus = useTranslations("admin.projects.status");
  const router = useRouter();
  const utils = trpc.useUtils();
  const fieldStrings = useFieldStrings();
  const discussion = useDiscussionPreview();

  const handleClose = onClose ?? (() => router.push("/data/projects"));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [publicStatus, setPublicStatus] = useState<(typeof STATUS_OPTIONS)[number]>(
    initial?.publicStatus ?? "IDEA",
  );
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [industryIds, setIndustryIds] = useState<string[]>(
    initial?.industries.map((i) => i.id) ?? [],
  );

  const slugPreview = useMemo(() => {
    if (slug.trim().length > 0) return slug.trim();
    return slugify(title);
  }, [title, slug]);

  // The dropdown wants every industry as an option, so page at the max size.
  const industriesQuery = trpc.projects.industries.list.useQuery(
    { limit: 100 },
    {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  );
  const industryOptions = useMemo(
    () =>
      (industriesQuery.data?.items ?? []).map((i) => ({
        value: i.id,
        label: i.displayName,
        searchText: i.displayName,
        href: `/data/industries?industry=${i.id}`,
        hrefNewTab: true,
      })),
    [industriesQuery.data],
  );

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
      keywords,
      industryIds,
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
    if (mode === "edit") {
      if (!initial) return false;
      return (
        title.trim() !== initial.title ||
        slug.trim() !== initial.slug ||
        (url.trim() || null) !== (initial.url ?? null) ||
        (description.trim() || null) !== (initial.description ?? null) ||
        publicStatus !== initial.publicStatus ||
        !sameSet(keywords, initial.keywords) ||
        !sameSet(
          industryIds,
          initial.industries.map((i) => i.id),
        )
      );
    }
    return (
      title.trim() !== "" ||
      slug.trim() !== "" ||
      url.trim() !== "" ||
      description.trim() !== "" ||
      keywords.length > 0 ||
      industryIds.length > 0 ||
      publicStatus !== "IDEA"
    );
  }, [mode, initial, title, slug, url, description, publicStatus, keywords, industryIds]);

  // Cancel = revert to baseline (not close). Closing the panel is the
  // header's job ; the operator opened this bar to decide save-or-discard.
  function revert() {
    setTitle(initial?.title ?? "");
    setSlug(initial?.slug ?? "");
    setUrl(initial?.url ?? "");
    setDescription(initial?.description ?? "");
    setPublicStatus(initial?.publicStatus ?? "IDEA");
    setKeywords(initial?.keywords ?? []);
    setIndustryIds(initial?.industries.map((i) => i.id) ?? []);
  }

  const fieldNodes: Record<AttributeKey, ReactNode> = {
    title: (
      <FieldRow label={tFields("title")} htmlFor="title" icon={FIELD_TYPE_ICON.text}>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
        />
      </FieldRow>
    ),
    slug: (
      <FieldRow label={tFields("slug")} htmlFor="slug" icon={FIELD_TYPE_ICON.text}>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={slugPreview}
          maxLength={60}
        />
        {slugPreview.length > 0 && slug.trim().length === 0 && (
          <p className="text-xs text-muted-foreground">
            {tFields("slugPreview", { slug: slugPreview })}
          </p>
        )}
      </FieldRow>
    ),
    url: (
      <FieldRow label={tFields("url")} htmlFor="url" icon={FIELD_TYPE_ICON.url}>
        <Input
          id="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={tFields("urlPlaceholder")}
          inputMode="url"
        />
      </FieldRow>
    ),
    publicStatus: (
      <FieldRow
        label={tFields("publicStatus")}
        htmlFor="publicStatus"
        icon={FIELD_TYPE_ICON.singleSelect}
      >
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
      </FieldRow>
    ),
    keywords: (
      <FieldRow label={tFields("keywords")} htmlFor="keywords" icon={FIELD_TYPE_ICON.multiSelect}>
        <MultiSelect
          id="keywords"
          value={keywords}
          onChange={setKeywords}
          allowCustom
          max={50}
          normalizeCustom={(raw) => {
            const k = raw.trim().toLowerCase();
            return k.length > 0 && k.length <= 40 ? k : null;
          }}
          labels={{
            placeholder: tFields("keywordsPlaceholder"),
            add: tFields("keywordsAdd"),
            remove: (name) => t("removeKeyword", { name }),
            create: (value) => t("createKeyword", { value }),
          }}
        />
        <p className="text-xs text-muted-foreground">{tFields("keywordsHelp")}</p>
      </FieldRow>
    ),
    industries: (
      <FieldRow label={tFields("industries")} htmlFor="industries" icon={FIELD_TYPE_ICON.relation}>
        <MultiSelect
          id="industries"
          value={industryIds}
          onChange={setIndustryIds}
          options={industryOptions}
          labels={{
            placeholder: t("industriesSearchPlaceholder"),
            add: t("addIndustry"),
            remove: (name) => t("removeIndustry", { name }),
            noResults: t("industriesEmpty"),
          }}
        />
      </FieldRow>
    ),
  };

  // Attributes render in the table's configured column order, minus the
  // description (its own section below) which never appears as a column.
  const order = fieldOrder ?? DEFAULT_FIELD_ORDER;
  const attributeOrder = order.filter((k): k is AttributeKey => k !== "description");

  return (
    <form onSubmit={onSubmit} className="space-y-8 pb-20">
      {/* Full-page heading only ; in a panel the PanelHeader already shows the
          record title, so we skip it there to avoid a duplicate. */}
      {containment === "viewport" && (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "create" ? t("createTitle") : t("editTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "create" ? t("createSubtitle") : t("editSubtitle")}
          </p>
        </div>
      )}

      {/* `contentClassName` carries the `@container` so the label-left switch
          responds to the panel width ; it wraps only the fields, never the
          DirtyFormBar below (which must anchor to the panel). */}
      <PageSection
        title={tSection("attributesTitle")}
        subtitle={tSection("attributesSubtitle")}
        contentClassName="@container space-y-6"
      >
        {attributeOrder.map((k) => (
          <Fragment key={k}>{fieldNodes[k]}</Fragment>
        ))}
      </PageSection>

      <PageSection title={tSection("descriptionTitle")} subtitle={tSection("descriptionSubtitle")}>
        <RichTextEditor
          id="description"
          value={description}
          onChange={setDescription}
          labels={fieldStrings.labels.richText}
          placeholder={tFields("descriptionPlaceholder")}
          ariaLabel={tFields("description")}
          minHeight={40}
        />
      </PageSection>

      <PageSection title={tSection("discussionTitle")} subtitle={tSection("discussionSubtitle")}>
        <DiscussionSection {...discussion} />
      </PageSection>

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
