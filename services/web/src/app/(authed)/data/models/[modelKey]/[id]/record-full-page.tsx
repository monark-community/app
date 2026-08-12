"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AutoForm,
  dataFieldToFieldDef,
  recordDataToDefaultValues,
  type DataFieldForAdapter,
  type FieldDef,
  type RelationSource,
} from "@/components/fields";
import { trpc } from "@/lib/trpc";
import { RecordAccessSection } from "../record-access-section";
import { RecordWatchButton } from "../watch-buttons";

interface ModelInfo {
  id: string;
  key: string;
  name: string;
  organizationId: string | null;
}

interface RawField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: DataFieldForAdapter["type"];
  config: unknown;
  required: boolean;
  archivedAt: string | null;
}

export function RecordFullPage({ model, recordId }: { model: ModelInfo; recordId: string }) {
  const t = useTranslations("data.records");
  const router = useRouter();
  const utils = trpc.useUtils();

  const fieldsQuery = trpc.dataModels.fields.list.useQuery({ dataModelId: model.id });
  const rawFields: RawField[] = fieldsQuery.data ?? [];
  const activeFields = rawFields.filter((f) => !f.archivedAt);

  async function resolveTargetModelId(targetKey: string): Promise<string | null> {
    const model = await utils.dataModels.models.getByKey
      .fetch({ key: targetKey })
      .catch(() => null);
    return model?.id ?? null;
  }

  function makeRelationSource(config: {
    relationTarget: string;
    relationTargetKind: "DATA_MODEL" | "SYSTEM_MODEL";
  }): RelationSource {
    if (config.relationTargetKind !== "DATA_MODEL") {
      return {
        model: config.relationTarget,
        loadOptions: async () => [],
        loadByIds: async () => [],
      };
    }
    return {
      model: config.relationTarget,
      loadOptions: async (query) => {
        const targetId = await resolveTargetModelId(config.relationTarget);
        if (!targetId) return [];
        const page = await utils.dataModels.records.list.fetch({
          dataModelId: targetId,
          search: query || undefined,
          limit: 20,
        });
        return page.items.map((r) => ({ id: r.id, label: r.title }));
      },
      loadByIds: async (ids) => {
        const results = await Promise.all(
          ids.map((id) => utils.dataModels.records.getById.fetch({ id }).catch(() => null)),
        );
        return results
          .filter((r): r is NonNullable<typeof r> => r != null)
          .map((r) => ({ id: r.id, label: r.title }));
      },
    };
  }

  const fieldDefs: FieldDef[] = activeFields.map((f) =>
    dataFieldToFieldDef(f, { relationSource: makeRelationSource }),
  );

  const recordQuery = trpc.dataModels.records.getById.useQuery({ id: recordId });

  const updateMutation = trpc.dataModels.records.update.useMutation({
    onSuccess: () => {
      toast.success(t("updateSuccess"));
      utils.dataModels.records.list.invalidate({ dataModelId: model.id });
      utils.dataModels.records.getById.invalidate({ id: recordId });
    },
    onError: (err) => toast.error(t("updateError") + ` (${err.message})`),
  });

  const backHref = `/data/models/${model.key}?record=${recordId}`;

  if (fieldsQuery.isLoading || recordQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!recordQuery.data) {
    return <p className="text-sm text-muted-foreground">{t("notFound")}</p>;
  }

  const defaultValues = recordDataToDefaultValues(activeFields, recordQuery.data.data);

  // Full-width, relying on the Data section `<main>`'s own padding (`px` +
  // `pt-8`) rather than re-centering in a `max-w-2xl` column or adding a second
  // `py-8` — so this record page matches its full-width records-list sibling
  // (the Data section's SectionShell uses `variant="full"`, unlike the
  // centered `variant="centered"` admin / account forms use).
  return (
    <div className="space-y-6">
      <PageHeader
        title={recordQuery.data.title}
        backHref={backHref}
        backLabel={t("backToList", { model: model.name })}
      />
      <div className="flex justify-end">
        <RecordWatchButton recordId={recordId} />
      </div>
      <AutoForm
        key={recordId}
        fields={fieldDefs}
        defaultValues={defaultValues}
        onSubmit={async (values) => {
          await updateMutation.mutateAsync({ id: recordId, data: values });
        }}
        onCancel={() => router.push(`/data/models/${model.key}`)}
        submitLabel={t("submit")}
        cancelLabel={t("cancel")}
        isBusy={updateMutation.isPending}
      />
      {model.organizationId && (
        <RecordAccessSection recordId={recordId} organizationId={model.organizationId} />
      )}
    </div>
  );
}
