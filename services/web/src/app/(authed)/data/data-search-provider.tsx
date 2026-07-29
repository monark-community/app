"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Database } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { SearchResultsGroup } from "@/components/global-search/search-results-group";
import {
  SEARCH_MIN_QUERY,
  type SearchProviderProps,
} from "@/components/global-search/search-contract";

/** The `[modelKey]` segment of a `/data/models/<key>` path, or null elsewhere. */
function modelKeyFromPath(pathname: string): string | null {
  const raw = pathname.match(/^\/data\/models\/([^/?#]+)/)?.[1];
  return raw ? decodeURIComponent(raw) : null;
}

/**
 * Global-search content provider for Data Models : records of the model the
 * user is currently viewing, matched by title through the same gated
 * `records.list` search the record table uses (so per-model permission +
 * row-level access are already enforced). Contextual to the open model — on a
 * bare `/data` route (before the redirect resolves a model) it yields nothing.
 * Cross-model search is a deferred follow-up.
 */
export function DataSearchProvider({ query, onNavigate }: SearchProviderProps) {
  const t = useTranslations("globalSearch");
  const pathname = usePathname();
  const modelKey = modelKeyFromPath(pathname);

  const modelQuery = trpc.dataModels.models.getByKey.useQuery(
    { key: modelKey ?? "" },
    { enabled: !!modelKey, refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const modelId = modelQuery.data?.id ?? null;

  const recordsQuery = trpc.dataModels.records.list.useQuery(
    { dataModelId: modelId ?? "", search: query, limit: 8 },
    { enabled: !!modelId && query.length >= SEARCH_MIN_QUERY },
  );
  const records = recordsQuery.data?.items ?? [];
  const loading = modelQuery.isFetching || recordsQuery.isFetching;

  return (
    <SearchResultsGroup heading={t("groups.data")} loading={loading} count={records.length}>
      {records.map((record) => (
        <CommandItem
          key={record.id}
          value={`record-${record.id}`}
          onSelect={() => onNavigate(`/data/models/${modelKey}?record=${record.id}`)}
        >
          <Database className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{record.title}</span>
        </CommandItem>
      ))}
    </SearchResultsGroup>
  );
}
