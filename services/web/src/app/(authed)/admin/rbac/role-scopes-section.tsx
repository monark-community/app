"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FilterNode } from "@monark/query/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { QueryChipBar } from "@/components/query/query-chip-bar";
import { useMqlLabels } from "@/components/query/use-mql-labels";

/**
 * Record scopes for one role: "this role may read the records matching this
 * query", per database.
 *
 * Edit-mode only. A scope hangs off a role id, so there is nothing to attach it
 * to until the role exists ; and it saves immediately rather than joining the
 * role form's dirty state, because it is a separate resource with its own
 * permission (mirroring `RecordAccessSection`, which does the same for the
 * per-record ACL).
 *
 * Only databases the role can actually read are listed. Scoping a database the
 * role has no `record-read` on would be a rule with nothing to narrow.
 */
export function RoleScopesSection({
  roleId,
  permissions,
}: {
  roleId: string;
  /** The role's currently-selected permission keys, so the list tracks the
   *  form's live state rather than what was last saved. */
  permissions: ReadonlySet<string>;
}) {
  const t = useTranslations("admin.rbac.scopes");
  const utils = trpc.useUtils();
  const mqlLabels = useMqlLabels();

  // Gated the same way the procedures are ; a caller without the permission
  // sees nothing rather than an empty card they cannot use.
  const { data: canManage } = trpc.rbac.myPermissions.useQuery(undefined, {
    select: (perms: string[]) => perms.includes("data-models.manage-record-scopes"),
  });
  const enabled = canManage === true;

  const modelsQuery = trpc.dataModels.models.list.useQuery({ limit: 200 }, { enabled });
  const scopesQuery = trpc.dataModels.scopes.listForRole.useQuery({ roleId }, { enabled });

  const [editing, setEditing] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTree, setDraftTree] = useState<FilterNode | null>(null);

  const setScope = trpc.dataModels.scopes.set.useMutation({
    onSuccess: () => {
      toast.success(t("saved"));
      void utils.dataModels.scopes.listForRole.invalidate({ roleId });
      setEditing(null);
    },
    onError: (e) => toast.error(`${t("saveFailed")} (${e.message})`),
  });
  const clearScope = trpc.dataModels.scopes.clear.useMutation({
    onSuccess: () => {
      toast.success(t("cleared"));
      void utils.dataModels.scopes.listForRole.invalidate({ roleId });
      setEditing(null);
    },
    onError: (e) => toast.error(`${t("saveFailed")} (${e.message})`),
  });

  // A database is scopable when this role grants read on it, either through the
  // per-model permission or the generic one.
  const readable = useMemo(() => {
    const models = modelsQuery.data?.items ?? [];
    const blanket = permissions.has("record-read");
    return models.filter((m) => blanket || permissions.has(`${m.key}-record-read`));
  }, [modelsQuery.data, permissions]);

  const scopeByModel = useMemo(
    () => new Map((scopesQuery.data ?? []).map((s) => [s.dataModelId, s])),
    [scopesQuery.data],
  );

  if (!enabled) return null;

  return (
    <div className="space-y-3">
      <Separator />
      <div>
        <h3 className="text-sm font-medium">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {modelsQuery.isPending || scopesQuery.isPending ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      ) : readable.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noDatabases")}</p>
      ) : (
        <ul className="space-y-2">
          {readable.map((model) => {
            const scope = scopeByModel.get(model.id);
            const isEditing = editing === model.id;
            return (
              <li key={model.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{model.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {scope ? <code className="font-mono">{scope.query}</code> : t("unrestricted")}
                    </p>
                  </div>
                  {!isEditing ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(model.id);
                          setDraftText(scope?.query ?? "");
                          setDraftTree(null);
                        }}
                      >
                        {scope ? t("edit") : t("limit")}
                      </Button>
                      {scope ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={clearScope.isPending}
                          onClick={() =>
                            clearScope.mutate({ dataModelId: model.id, roleId, verb: "READ" })
                          }
                        >
                          {t("remove")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {isEditing ? (
                  <ScopeEditor
                    dataModelId={model.id}
                    text={draftText}
                    onTextChange={setDraftText}
                    onTreeChange={setDraftTree}
                    saving={setScope.isPending}
                    onCancel={() => setEditing(null)}
                    onSave={() => {
                      if (!draftTree || !draftText.trim()) {
                        toast.error(t("invalidQuery"));
                        return;
                      }
                      // Send the text, not the tree: the server re-parses it
                      // against the model's real fields, so an unknown field is
                      // an error here rather than a broken query later.
                      setScope.mutate({
                        dataModelId: model.id,
                        roleId,
                        verb: "READ",
                        query: draftText.trim(),
                      });
                    }}
                    labels={{
                      placeholder: t("queryPlaceholder"),
                      invalid: t("invalidQuery"),
                      fieldsHeading: t("fieldsHeading"),
                      valuesHeading: t("valuesHeading"),
                      hint: t("hint"),
                      save: t("save"),
                      cancel: t("cancel"),
                    }}
                    mqlLabels={mqlLabels}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScopeEditor({
  dataModelId,
  text,
  onTextChange,
  onTreeChange,
  saving,
  onSave,
  onCancel,
  labels,
  mqlLabels,
}: {
  dataModelId: string;
  text: string;
  onTextChange: (t: string) => void;
  onTreeChange: (t: FilterNode | null) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  labels: {
    placeholder: string;
    invalid: string;
    fieldsHeading: string;
    valuesHeading: string;
    hint: string;
    save: string;
    cancel: string;
  };
  mqlLabels: ReturnType<typeof useMqlLabels>;
}) {
  // Field metadata is per model, so it is fetched only once a row is actually
  // being edited rather than for every database up front.
  const fieldsQuery = trpc.dataModels.records.queryFields.useQuery({ dataModelId });

  return (
    <div className="mt-3 space-y-2">
      {fieldsQuery.isPending ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <QueryChipBar
          fields={fieldsQuery.data ?? []}
          text={text}
          onTextChange={onTextChange}
          onChange={onTreeChange}
          labels={{
            placeholder: labels.placeholder,
            invalid: labels.invalid,
            fieldsHeading: labels.fieldsHeading,
            valuesHeading: labels.valuesHeading,
            hint: labels.hint,
          }}
          {...mqlLabels}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {labels.save}
        </Button>
      </div>
    </div>
  );
}
