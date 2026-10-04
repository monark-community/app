"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ColorInput } from "@/components/ui/color-input";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldRow } from "@/components/patterns";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { OrganizationLogoEditor } from "@/components/organization-logo-editor";
import { PageHeader } from "@/components/page-header";
import { trpc } from "@/lib/trpc";
import { useBrandPreview, validHex } from "@/lib/brand-preview";
import { brandThemeColors, type DarkColorMode } from "@/lib/brand-theme";
import { BRAND_ADAPT_BELOW, contrastOnTheme } from "@monark/common/color";
import { ChevronRight, TriangleAlert } from "lucide-react";

export function OrganizationDetail({
  orgId,
  containment = "viewport",
}: {
  orgId: string;
  containment?: "viewport" | "container";
}) {
  const t = useTranslations("admin.organizations.detail");
  const tCommon = useTranslations("common");
  const inPanel = containment === "container";
  const utils = trpc.useUtils();
  const query = trpc.organizations.adminGet.useQuery(
    { id: orgId },
    { refetchOnWindowFocus: false },
  );
  const update = trpc.organizations.adminUpdate.useMutation({
    onSuccess: (_data, variables) => {
      // A saved brand change on the org that themes this deployment is
      // painted by the server-rendered root layout, so reload to pick it
      // up everywhere ; the preview already showed it, so nothing jumps.
      const brandChanged =
        variables.primaryColor !== undefined ||
        variables.primaryColorDark !== undefined ||
        variables.primaryColorDarkMode !== undefined ||
        variables.surfaceTint !== undefined;
      if (brandChanged && isBrandOrg()) {
        window.location.reload();
        return;
      }
      void utils.organizations.adminGet.invalidate({ id: orgId });
      void utils.organizations.adminList.invalidate();
      toast.success(t("saved"));
    },
    onError: (error) => {
      toast.error(error.message || t("saveError"));
    },
  });

  // The AI assistant's per-org name. Owned by @monark/chat rather than the org
  // row (it lives in the metadata sidecar), so it's a separate query + mutation
  // riding the same form. `enabled: false` on the response means the
  // `chat.org-branding` flag is off for this org and the field doesn't render at
  // all — the assistant then answers to the deploy-wide name.
  const branding = trpc.chat.branding.get.useQuery(
    { organizationId: orgId },
    { refetchOnWindowFocus: false },
  );
  const brandingEnabled = branding.data?.enabled === true;
  const saveBranding = trpc.chat.branding.set.useMutation({
    onSuccess: () => {
      void utils.chat.branding.get.invalidate({ organizationId: orgId });
      // The companion resolves its name from `chat.config`; drop it so a rename
      // shows up in the launcher / panel without a reload.
      void utils.chat.config.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || t("saveError"));
    },
  });

  // Tenancy mode drives single-tenant UX adaptations on this page :
  // Controlled inputs ; resync from the row whenever the underlying
  // query result rotates so a save (or another admin's change) doesn't
  // leave the form pointing at stale values.
  const [displayName, setDisplayName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  // Dark theme color : blank = adapted automatically, a color = used as is.
  const [primaryColorDark, setPrimaryColorDark] = useState("");
  const primaryColorDarkMode: DarkColorMode = primaryColorDark.trim() ? "custom" : "adaptive";
  // Null = unset on the org, so the deployment's BRANDING_SURFACE_TINT applies.
  const [surfaceTint, setSurfaceTint] = useState<number | null>(null);
  const [assistantName, setAssistantName] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setDisplayName(query.data.displayName);
    setPrimaryColor(query.data.primaryColor ?? "");
    setPrimaryColorDark(query.data.primaryColorDark ?? "");
    setSurfaceTint(query.data.surfaceTint);
  }, [query.data]);

  useEffect(() => {
    if (!branding.data) return;
    setAssistantName(branding.data.assistantName ?? "");
  }, [branding.data]);

  // Dirty-check vs. the source row so the Save button activates only
  // when something actually changed. Cancel reverts to the row values.
  const baseline = useMemo(() => {
    if (!query.data) return null;
    return {
      displayName: query.data.displayName,
      primaryColor: query.data.primaryColor ?? "",
      primaryColorDarkMode: darkModeOf(query.data.primaryColorDarkMode),
      primaryColorDark: query.data.primaryColorDark ?? "",
      surfaceTint: query.data.surfaceTint,
    };
  }, [query.data]);

  // Separate baseline: the assistant name comes from its own query and may not
  // have landed yet when the org row has. Treated as clean until it does, so a
  // half-loaded form never shows the save bar.
  const assistantBaseline = brandingEnabled ? (branding.data?.assistantName ?? "") : null;

  const brandDirty = Boolean(
    baseline &&
    (primaryColor.trim() !== baseline.primaryColor ||
      primaryColorDarkMode !== baseline.primaryColorDarkMode ||
      primaryColorDark.trim() !== baseline.primaryColorDark ||
      surfaceTint !== baseline.surfaceTint),
  );
  const dirty = Boolean(
    brandDirty ||
    (baseline && displayName.trim() !== baseline.displayName) ||
    (assistantBaseline !== null && assistantName.trim() !== assistantBaseline),
  );

  // What each theme will actually use. Light mode always adapts a primary
  // that barely differs from its background (white, pale yellow) ; dark
  // mode follows the chosen behaviour. Adaptations show as info notes ; a
  // dark-mode color that is used as is ("same" or "custom") warns when it
  // lacks contrast on the dark background.
  const editedPrimary = validHex(primaryColor);
  const editedDark = validHex(primaryColorDark);
  const themeColors = editedPrimary
    ? brandThemeColors({
        primary: editedPrimary,
        darkMode: primaryColorDarkMode,
        primaryDark: editedDark,
        accent: null,
      })
    : null;
  const adaptedLight =
    editedPrimary && themeColors && themeColors.light !== editedPrimary ? themeColors.light : null;
  const adaptedDark =
    primaryColorDarkMode === "adaptive" &&
    editedPrimary &&
    themeColors &&
    themeColors.dark !== editedPrimary
      ? themeColors.dark
      : null;
  // A dark theme color the org set is used as is, so warn when it lacks contrast.
  const darkCustomContrast = editedDark ? contrastOnTheme(editedDark, "dark") : null;
  const darkLowContrast =
    darkCustomContrast !== null && darkCustomContrast < BRAND_ADAPT_BELOW
      ? darkCustomContrast
      : null;

  // Advanced settings start open when they hold a non-default choice, so
  // nothing that affects the theme is hidden behind a closed section.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedCustomized = Boolean(
    baseline && (baseline.primaryColorDarkMode !== "adaptive" || baseline.surfaceTint !== null),
  );
  useEffect(() => {
    if (advancedCustomized) setAdvancedOpen(true);
  }, [advancedCustomized]);

  // Unsaved color / tint edits re-theme the whole app live (only when this
  // org is the one theming the deployment) ; cancel or leaving reverts.
  const { isBrandOrg, defaultTint } = useBrandPreview(
    orgId,
    { primaryColor, primaryColorDarkMode, primaryColorDark, surfaceTint },
    brandDirty,
  );

  function onCancel() {
    if (assistantBaseline !== null) setAssistantName(assistantBaseline);
    if (!baseline) return;
    setDisplayName(baseline.displayName);
    setPrimaryColor(baseline.primaryColor);
    setPrimaryColorDark(baseline.primaryColorDark);
    setSurfaceTint(baseline.surfaceTint);
  }

  function onSave() {
    if (!baseline) return;
    const nextDisplayName = displayName.trim();
    const nextColor = primaryColor.trim();
    const nextColorDark = primaryColorDark.trim();
    const nextAssistantName = assistantName.trim();

    if (nextDisplayName.length < 1 || nextDisplayName.length > 120) {
      toast.error(t("saveError"));
      return;
    }
    if (
      (nextColor !== "" && !validHex(nextColor)) ||
      (nextColorDark !== "" && !validHex(nextColorDark))
    ) {
      toast.error(t("invalidColor"));
      return;
    }

    // Only ship fields that actually changed ; the procedure tolerates
    // partial payloads and avoids needless writes / audit-log entries.
    const payload: {
      id: string;
      displayName?: string;
      primaryColor?: string | null;
      primaryColorDark?: string | null;
      primaryColorDarkMode?: DarkColorMode;
      surfaceTint?: number | null;
    } = { id: orgId };
    if (nextDisplayName !== baseline.displayName) {
      payload.displayName = nextDisplayName;
    }
    if (nextColor !== baseline.primaryColor) {
      payload.primaryColor = nextColor === "" ? null : nextColor;
    }
    if (primaryColorDarkMode !== baseline.primaryColorDarkMode) {
      payload.primaryColorDarkMode = primaryColorDarkMode;
    }
    if (nextColorDark !== baseline.primaryColorDark) {
      payload.primaryColorDark = nextColorDark === "" ? null : nextColorDark;
    }
    if (surfaceTint !== baseline.surfaceTint) {
      payload.surfaceTint = surfaceTint;
    }
    const orgChanged =
      payload.displayName !== undefined ||
      payload.primaryColor !== undefined ||
      payload.primaryColorDark !== undefined ||
      payload.primaryColorDarkMode !== undefined ||
      payload.surfaceTint !== undefined;
    const assistantChanged = assistantBaseline !== null && nextAssistantName !== assistantBaseline;

    // Two backing stores (the org row, and chat's metadata sidecar), one save
    // button. Each only fires when its own half changed ; the success toast is
    // owned by whichever ran, so a branding-only save still confirms.
    if (orgChanged) update.mutate(payload);
    if (assistantChanged) {
      saveBranding.mutate(
        { organizationId: orgId, assistantName: nextAssistantName || null },
        { onSuccess: orgChanged ? undefined : () => toast.success(t("saved")) },
      );
    }
  }

  async function onLogoChanged() {
    await utils.organizations.adminGet.invalidate({ id: orgId });
    await utils.organizations.adminList.invalidate();
  }

  function onLogoRemove() {
    update.mutate(
      { id: orgId, logoUrl: null },
      { onSuccess: () => toast.success(t("logoRemoved")) },
    );
  }

  if (query.isLoading) {
    return (
      <section className="space-y-8">
        {!inPanel && (
          <PageHeader title={t("title")} subtitle={t("subtitle")} backLabel={t("backAria")} />
        )}
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-32 w-full" />
        </div>
      </section>
    );
  }

  if (query.isError || !query.data) {
    return (
      <section className="space-y-8">
        {!inPanel && (
          <PageHeader title={t("title")} subtitle={t("subtitle")} backLabel={t("backAria")} />
        )}
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("loadError")}
        </p>
      </section>
    );
  }

  return (
    <section className={inPanel ? "space-y-8 pb-20" : "space-y-8"}>
      {inPanel ? (
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
      ) : (
        <PageHeader title={t("title")} subtitle={t("subtitle")} backLabel={t("backAria")} />
      )}

      <div className="space-y-5">
        <OrganizationLogoEditor
          orgId={orgId}
          logoUrl={query.data.logoUrl}
          onChange={onLogoChanged}
          onRemove={onLogoRemove}
        />

        <div className="@container space-y-5">
          <FieldRow label={t("labels.displayName")} htmlFor="org-displayName">
            <Input
              id="org-displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t("placeholders.displayName")}
              maxLength={120}
            />
          </FieldRow>

          <FieldRow label={t("labels.primaryColor")} htmlFor="org-primary-color">
            <ColorInput
              id="org-primary-color"
              value={primaryColor}
              onChange={setPrimaryColor}
              placeholder="#2563EB"
              defaultColor="#ffffff"
              clearable
              aria-label={t("labels.primaryColor")}
            />
            <p className="text-xs text-muted-foreground">{t("primaryColorHint")}</p>
            {(adaptedLight || adaptedDark) && (
              <p
                role="status"
                className="flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
              >
                <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                {t("primaryAdjusted")}
              </p>
            )}
          </FieldRow>

          {/* Assistant branding. Rendered only when `chat.org-branding` is on
              for this org ; while the flag query is in flight nothing shows,
              which is why there's no skeleton here — a one-line field that
              may not exist at all would flash worse than it waits. */}
          {brandingEnabled && (
            <FieldRow label={t("labels.assistantName")} htmlFor="org-assistant-name">
              <Input
                id="org-assistant-name"
                value={assistantName}
                onChange={(event) => setAssistantName(event.target.value)}
                placeholder={branding.data?.defaultName ?? ""}
                maxLength={40}
              />
              <p className="text-xs text-muted-foreground">
                {t("assistantNameHint", { defaultName: branding.data?.defaultName ?? "" })}
              </p>
            </FieldRow>
          )}
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="space-y-5">
          <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1.5 text-sm font-semibold">
            <ChevronRight
              aria-hidden
              className="size-4 transition-transform group-data-[state=open]:rotate-90"
            />
            {t("advancedSettings")}
          </CollapsibleTrigger>
          <CollapsibleContent className="@container space-y-5">
            <FieldRow label={t("labels.primaryColorDark")} htmlFor="org-primary-color-dark">
              <ColorInput
                id="org-primary-color-dark"
                value={primaryColorDark}
                onChange={setPrimaryColorDark}
                placeholder={adaptBrandPlaceholder(editedPrimary)}
                defaultColor={adaptBrandPlaceholder(editedPrimary) || "#ffffff"}
                clearable
                aria-label={t("labels.primaryColorDark")}
              />
              <p className="text-xs text-muted-foreground">{t("primaryColorDarkHint")}</p>
              {darkLowContrast !== null && (
                <p
                  role="status"
                  className="flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                >
                  <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                  {t("primaryColorDarkLowContrast", { ratio: darkLowContrast.toFixed(1) })}
                </p>
              )}
            </FieldRow>

            <FieldRow label={t("labels.surfaceTint")} htmlFor="org-surface-tint">
              <div className="flex items-center gap-3">
                <Slider
                  id="org-surface-tint"
                  aria-label={t("labels.surfaceTint")}
                  min={0}
                  max={2}
                  step={0.05}
                  value={[surfaceTint ?? defaultTint()]}
                  onValueChange={([value]) => {
                    if (value !== undefined) setSurfaceTint(Math.round(value * 100) / 100);
                  }}
                  className="max-w-xs"
                />
                <span className="w-12 text-sm tabular-nums">
                  {(surfaceTint ?? defaultTint()).toFixed(2)}
                </span>
                {surfaceTint !== null && (
                  <button
                    type="button"
                    className="text-xs text-primary underline underline-offset-2"
                    onClick={() => setSurfaceTint(null)}
                  >
                    {t("surfaceTintReset")}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("surfaceTintHint")}</p>
            </FieldRow>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <DirtyFormBar
        containment={containment}
        open={dirty}
        onSave={onSave}
        onCancel={onCancel}
        saving={update.isPending || saveBranding.isPending}
        saveLabel={t("save")}
        savingLabel={t("saving")}
        cancelLabel={t("cancel")}
        message={tCommon("unsavedChanges")}
      />
    </section>
  );
}

// The stored mode, defaulting anything unset or unknown to "adaptive".
function darkModeOf(value: string | null | undefined): DarkColorMode {
  return value === "same" || value === "custom" ? value : "adaptive";
}

// The automatic dark-mode color, suggested as the starting point for "custom".
function adaptBrandPlaceholder(primary: string | null): string {
  return primary
    ? brandThemeColors({ primary, darkMode: "adaptive", primaryDark: null, accent: null }).dark
    : "";
}
