"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import type { FilterNode } from "@monark/query/contracts";
import { trpc } from "@/lib/trpc";
import { QueryBar, type QueryFieldMeta } from "@/components/query/query-bar";
import { useMqlLabels } from "@/components/query/use-mql-labels";
import { CollapsibleSection } from "../collapsible-section";

/**
 * Dev-only MonarkQL playground. Pick a Data Model, type a query, and see the
 * parse result live : the filter runs against `dataModels.records.list` for a
 * row count, and the parsed {@link FilterNode} tree is shown so you can confirm
 * a query compiles to what you expect before wiring it into a saved view. All
 * read-only — no writes, no new server surface (reuses the record list + the
 * client-side parser in the shared QueryBar).
 */
export function QueryPlaygroundPanel() {
  const t = useTranslations("devOverlay");
  const tq = useTranslations("data.records.query");
  const mqlLabels = useMqlLabels();
  const [modelId, setModelId] = useState("");
  const [text, setText] = useState("");
  const [tree, setTree] = useState<FilterNode | null>(null);

  const session = trpc.users.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const signedIn = Boolean(session.data);

  const modelsQuery = trpc.dataModels.models.list.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false, enabled: signedIn },
  );
  const models = modelsQuery.data?.items ?? [];

  // Default to the first model once the list loads.
  useEffect(() => {
    if (!modelId && models[0]) setModelId(models[0].id);
  }, [models, modelId]);

  const fieldsQuery = trpc.dataModels.records.queryFields.useQuery(
    { dataModelId: modelId },
    { enabled: signedIn && modelId !== "", refetchOnWindowFocus: false },
  );
  const fields: QueryFieldMeta[] = fieldsQuery.data ?? [];

  const countQuery = trpc.dataModels.records.list.useQuery(
    { dataModelId: modelId, filter: tree ?? undefined, limit: 1 },
    {
      enabled: signedIn && modelId !== "",
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
    },
  );
  const total = countQuery.data?.total;

  const badge =
    total != null ? (
      <span className="rounded-full bg-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {t("queryPlayground.rows", { count: total })}
      </span>
    ) : undefined;

  return (
    <CollapsibleSection title={t("sections.queryPlayground")} badge={badge}>
      {!signedIn ? (
        <p className="text-xs text-muted-foreground">{t("queryPlayground.signInPrompt")}</p>
      ) : (
        <div className="space-y-3">
          <select
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value);
              setText("");
              setTree(null);
            }}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            aria-label={t("queryPlayground.model")}
          >
            <option value="">{t("queryPlayground.selectModel")}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {modelId !== "" && (
            <>
              <QueryBar
                fields={fields}
                text={text}
                onTextChange={setText}
                onChange={setTree}
                labels={{
                  placeholder: tq("placeholder"),
                  invalid: tq("invalid"),
                  fieldsHeading: tq("fieldsHeading"),
                  valuesHeading: tq("valuesHeading"),
                  hint: tq("hint"),
                }}
                {...mqlLabels}
              />

              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("queryPlayground.tree")}
                </p>
                <pre className="max-h-40 overflow-auto rounded border border-border bg-muted/40 p-2 font-mono text-[10px] leading-relaxed text-foreground">
                  {tree ? JSON.stringify(tree, null, 2) : t("queryPlayground.noQuery")}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
