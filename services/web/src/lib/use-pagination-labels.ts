"use client";

import { useTranslations } from "next-intl";
import type { DataTablePaginationLabels } from "@/components/patterns";

/**
 * Builds the translated {@link DataTablePaginationLabels} for the shared
 * `DataTable` pagination footer from the `table.pagination` catalog. Keeps
 * the pattern component text-free (i18n stays with the caller) while every
 * list screen gets identical footer strings without re-declaring them.
 *
 * The `showing` label uses `{from}`, `{to}`, `{total}` placeholders that the
 * footer substitutes with live numbers, so it is fetched with `raw` (no ICU
 * interpolation here).
 */
export function usePaginationLabels(): DataTablePaginationLabels {
  const t = useTranslations("table.pagination");
  return {
    showing: t.raw("showing") as string,
    rowsPerPage: t("rowsPerPage"),
    previous: t("previous"),
    next: t("next"),
  };
}
