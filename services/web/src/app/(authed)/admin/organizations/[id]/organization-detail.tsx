"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ColorInput } from "@/components/ui/color-input";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldRow } from "@/components/patterns";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { OrganizationLogoEditor } from "@/components/organization-logo-editor";
import { PageHeader } from "@/components/page-header";
import { trpc } from "@/lib/trpc";

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
    onSuccess: () => {
      void utils.organizations.adminGet.invalidate({ id: orgId });
      void utils.organizations.adminList.invalidate();
      toast.success(t("saved"));
    },
    onError: (error) => {
      toast.error(error.message || t("saveError"));
    },
  });

  // Tenancy mode drives single-tenant UX adaptations on this page :
  // the back link is hidden when there's nowhere meaningful to go back
  // to (single-tenant has only one org and the sidebar already lands on
  // this page directly).
  const bootstrapStatus = trpc.organizations.bootstrapStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const isSingleTenant = bootstrapStatus.data?.mode === "single";

  // Controlled inputs ; resync from the row whenever the underlying
  // query result rotates so a save (or another admin's change) doesn't
  // leave the form pointing at stale values.
  const [displayName, setDisplayName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setDisplayName(query.data.displayName);
    setPrimaryColor(query.data.primaryColor ?? "");
  }, [query.data]);

  // Dirty-check vs. the source row so the Save button activates only
  // when something actually changed. Cancel reverts to the row values.
  const baseline = useMemo(() => {
    if (!query.data) return null;
    return {
      displayName: query.data.displayName,
      primaryColor: query.data.primaryColor ?? "",
    };
  }, [query.data]);

  const dirty = Boolean(
    baseline &&
    (displayName.trim() !== baseline.displayName || primaryColor.trim() !== baseline.primaryColor),
  );

  function onCancel() {
    if (!baseline) return;
    setDisplayName(baseline.displayName);
    setPrimaryColor(baseline.primaryColor);
  }

  function onSave() {
    if (!baseline) return;
    const nextDisplayName = displayName.trim();
    const nextColor = primaryColor.trim();

    if (nextDisplayName.length < 1 || nextDisplayName.length > 120) {
      toast.error(t("saveError"));
      return;
    }
    if (nextColor !== "" && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(nextColor)) {
      toast.error(t("invalidColor"));
      return;
    }

    // Only ship fields that actually changed ; the procedure tolerates
    // partial payloads and avoids needless writes / audit-log entries.
    const payload: {
      id: string;
      displayName?: string;
      primaryColor?: string | null;
    } = { id: orgId };
    if (nextDisplayName !== baseline.displayName) {
      payload.displayName = nextDisplayName;
    }
    if (nextColor !== baseline.primaryColor) {
      payload.primaryColor = nextColor === "" ? null : nextColor;
    }
    update.mutate(payload);
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
          <PageHeader
            title={t("title")}
            subtitle={t("subtitle")}
            backHref={!isSingleTenant ? "/admin/organizations" : undefined}
            backLabel={t("backAria")}
          />
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
          <PageHeader
            title={t("title")}
            subtitle={t("subtitle")}
            backHref={!isSingleTenant ? "/admin/organizations" : undefined}
            backLabel={t("backAria")}
          />
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
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          backHref={!isSingleTenant ? "/admin/organizations" : undefined}
          backLabel={t("backAria")}
        />
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
              aria-label={t("labels.primaryColor")}
            />
            <p className="text-xs text-muted-foreground">{t("primaryColorHint")}</p>
          </FieldRow>
        </div>
      </div>

      <DirtyFormBar
        containment={containment}
        open={dirty}
        onSave={onSave}
        onCancel={onCancel}
        saving={update.isPending}
        saveLabel={t("save")}
        savingLabel={t("saving")}
        cancelLabel={t("cancel")}
        message={tCommon("unsavedChanges")}
      />
    </section>
  );
}
