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

interface ModelInfo {
  id: string;
  key: string;
  name: string;
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
    const orgScoped = await utils.dataModels.models.getByKey
      .fetch({ key: targetKey, platform: false })
      .catch(() => null);
    if (orgScoped) return orgScoped.id;
    const platform = await utils.dataModels.models.getByKey
      .fetch({ key: targetKey, platform: true })
      .catch(() => null);
    return platform?.id ?? null;
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
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!recordQuery.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-muted-foreground">{t("notFound")}</p>
      </div>
    );
  }

  const defaultValues = recordDataToDefaultValues(activeFields, recordQuery.data.data);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <PageHeader
        title={recordQuery.data.title}
        backHref={backHref}
        backLabel={t("backToList", { model: model.name })}
      />
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
    </div>
  );
}
