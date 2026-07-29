"use client";

import { useTranslations } from "next-intl";
import { Workflow } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { SearchResultsGroup } from "@/components/global-search/search-results-group";
import {
  SEARCH_MIN_QUERY,
  type SearchProviderProps,
} from "@/components/global-search/search-contract";

/**
 * Global-search content provider for automation : automations matching the
 * query by name (server-scoped to the caller's org, gated by `automation.view`).
 * Active on `/automation`. Selecting a result opens the automation editor.
 */
export function AutomationSearchProvider({ query, onNavigate }: SearchProviderProps) {
  const t = useTranslations("globalSearch");

  const automationsQuery = trpc.automation.automations.search.useQuery(
    { query },
    { enabled: query.length >= SEARCH_MIN_QUERY },
  );
  const automations = automationsQuery.data ?? [];

  return (
    <SearchResultsGroup
      heading={t("groups.automation")}
      loading={automationsQuery.isFetching}
      count={automations.length}
    >
      {automations.map((automation) => (
        <CommandItem
          key={automation.id}
          value={`automation-${automation.id}`}
          onSelect={() => onNavigate(`/automation/${automation.id}`)}
        >
          <Workflow className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{automation.name}</span>
        </CommandItem>
      ))}
    </SearchResultsGroup>
  );
}
