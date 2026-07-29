"use client";

import { useTranslations } from "next-intl";
import type { TableEmptyStateLabels } from "@/components/patterns";

/**
 * Builds the translated {@link TableEmptyStateLabels} bundle for a list's empty
 * state. The constrained-empty copy (search / filters) + clear actions come
 * from the shared `table.empty` catalog ; the genuinely-empty message stays the
 * screen's own entity-specific copy (`noData`, e.g. "No records yet.") so it
 * keeps reading naturally. Pass the current `query` so the search messages can
 * echo it back.
 */
export function useTableEmptyLabels(opts: {
  query: string;
  noData: string;
  noDataDescription?: string;
}): TableEmptyStateLabels {
  const t = useTranslations("table.empty");
  const { query, noData, noDataDescription } = opts;
  return {
    noData: { title: noData, description: noDataDescription },
    noSearch: { title: t("searchTitle", { query }), description: t("searchDescription") },
    noFilters: { title: t("filtersTitle"), description: t("filtersDescription") },
    noSearchFilters: {
      title: t("searchTitle", { query }),
      description: t("searchFiltersDescription"),
    },
    clearSearch: t("clearSearch"),
    clearFilters: t("clearFilters"),
    clearAll: t("clearAll"),
  };
}
