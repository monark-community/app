"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, type Paginated } from "@monark/common/pagination";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DataTablePaginationLabels, DataTablePaginationProps } from "./types";

/**
 * Cursor Prev/Next pagination state for a list table, paired with the
 * `<DataTable pagination>` footer. Holds the page size and a stack of the
 * cursors visited so far (page 0 uses `null`, page N uses the `nextCursor`
 * returned for page N-1), so Prev is a simple pop.
 *
 * The `resetKey` collapses back to the first page whenever the surrounding
 * filters / search change ; it is compared as a JSON string, and the reset
 * happens **during render** (React's blessed "adjust state on prop change"
 * pattern) so the query never fires once with a stale cursor against new
 * filters.
 *
 * Wiring :
 * ```tsx
 * const pagination = usePaginatedList({ resetKey: [search, statusFilter] });
 * const query = trpc.x.list.useQuery(
 *   { ...filters, limit: pagination.limit, cursor: pagination.cursor },
 *   { placeholderData: keepPreviousData },
 * );
 * <DataTable
 *   data={query.data?.items ?? []}
 *   pagination={pagination.getFooterProps(query.data, labels)}
 *   …
 * />
 * ```
 */
export function usePaginatedList(opts?: {
  pageSize?: number;
  /** When this changes (deep-compared as JSON), reset to the first page. */
  resetKey?: unknown;
}) {
  const initialSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  const keyStr = JSON.stringify(opts?.resetKey ?? null);

  const [state, setState] = useState<{
    key: string;
    pageSize: number;
    // Cursor used to fetch each visited page ; index 0 is always `null`.
    history: (string | null)[];
  }>({ key: keyStr, pageSize: initialSize, history: [null] });

  // Reset to the first page when the filter key changes — during render, so
  // the next fetch already uses `cursor: null` (no stale-cursor round-trip).
  if (state.key !== keyStr) {
    setState((s) => ({ key: keyStr, pageSize: s.pageSize, history: [null] }));
  }

  const pageIndex = state.history.length - 1;
  const cursor = state.history[pageIndex] ?? null;

  const goNext = useCallback((nextCursor: string) => {
    setState((s) => ({ ...s, history: [...s.history, nextCursor] }));
  }, []);

  const goPrev = useCallback(() => {
    setState((s) => (s.history.length > 1 ? { ...s, history: s.history.slice(0, -1) } : s));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setState((s) => ({ ...s, pageSize: size, history: [null] }));
  }, []);

  /** Assemble the footer props from the current query result + labels. */
  const getFooterProps = useCallback(
    (
      data: Paginated<unknown> | undefined,
      labels: DataTablePaginationLabels,
    ): DataTablePaginationProps => {
      const total = data?.total ?? 0;
      const pageCount = data?.items.length ?? 0;
      const nextCursor = data?.nextCursor ?? null;
      return {
        pageIndex,
        pageSize: state.pageSize,
        pageCount,
        total,
        canPrev: pageIndex > 0,
        canNext: nextCursor != null,
        onPrev: goPrev,
        onNext: () => {
          if (nextCursor != null) goNext(nextCursor);
        },
        onPageSize: setPageSize,
        labels,
      };
    },
    [pageIndex, state.pageSize, goNext, goPrev, setPageSize],
  );

  return {
    /** Pass as the query's `limit`. */
    limit: state.pageSize,
    /** Pass as the query's `cursor`. */
    cursor,
    pageIndex,
    pageSize: state.pageSize,
    goNext,
    goPrev,
    setPageSize,
    getFooterProps,
  };
}

/**
 * The list-table pagination footer : "Showing 1–25 of 340", a page-size
 * selector, and Prev / Next buttons. Rendered by `DataTable` when a
 * `pagination` prop is supplied ; also exported standalone for embeds.
 * Hidden entirely when there is nothing to page (no rows, first page).
 */
export function DataTablePagination({
  pageIndex,
  pageSize,
  pageCount,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onPageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  labels,
}: DataTablePaginationProps) {
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = pageIndex * pageSize + pageCount;

  const options = useMemo(
    () => Array.from(new Set([...pageSizeOptions, pageSize])).sort((a, b) => a - b),
    [pageSizeOptions, pageSize],
  );

  // Nothing to show : an empty single page needs no footer.
  if (total === 0 && !canPrev && !canNext) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <p className="tabular-nums">
        {labels.showing
          .replace("{from}", String(from))
          .replace("{to}", String(to))
          .replace("{total}", String(total))}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">{labels.rowsPerPage}</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onPrev}
            disabled={!canPrev}
            aria-label={labels.previous}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onNext}
            disabled={!canNext}
            aria-label={labels.next}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
