"use client";

import type { ComponentType } from "react";
import { FilterX, Inbox, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Why a list is empty — so the message explains the actual reason and offers
 * the right next step, instead of always blaming the search box.
 *
 * - `no-data` — the dataset is genuinely empty (nothing created yet).
 * - `no-search` — a search is active and matched nothing.
 * - `no-filters` — filters are active (no search) and matched nothing.
 * - `no-search-filters` — search AND filters are active and matched nothing.
 */
export type TableEmptyReason = "no-data" | "no-search" | "no-filters" | "no-search-filters";

/** Derive the reason from what's currently constraining the list. */
export function tableEmptyReason(ctx: {
  hasSearch: boolean;
  hasFilters: boolean;
}): TableEmptyReason {
  if (ctx.hasSearch && ctx.hasFilters) return "no-search-filters";
  if (ctx.hasSearch) return "no-search";
  if (ctx.hasFilters) return "no-filters";
  return "no-data";
}

interface Copy {
  title: string;
  description?: string;
}

export interface TableEmptyStateLabels {
  /** The genuinely-empty-dataset copy — usually the screen's own "No X yet". */
  noData: Copy;
  noSearch: Copy;
  noFilters: Copy;
  noSearchFilters: Copy;
  clearSearch: string;
  clearFilters: string;
  clearAll: string;
}

const ICONS: Record<TableEmptyReason, ComponentType<{ className?: string }>> = {
  "no-data": Inbox,
  "no-search": SearchX,
  "no-filters": FilterX,
  "no-search-filters": FilterX,
};

type Action = { label: string; onClick: () => void; icon?: ComponentType<{ className?: string }> };

/**
 * The standard list empty-state, shown inside a {@link DataTable}'s `emptyState`
 * slot. Renders an icon + title + description + a single next-step button keyed
 * to the {@link TableEmptyReason} : create the first record (empty dataset), or
 * clear the search / filters that filtered everything out. Text-free : pass
 * already-translated `labels` (see `useTableEmptyLabels`).
 */
export function TableEmptyState({
  reason,
  labels,
  onClearSearch,
  onClearFilters,
  createAction,
}: {
  reason: TableEmptyReason;
  labels: TableEmptyStateLabels;
  /** Clears the active search (shown as the next step for search-empty). */
  onClearSearch?: () => void;
  /** Resets the active filters (shown as the next step for filter-empty). */
  onClearFilters?: () => void;
  /** The primary CTA offered when the dataset is genuinely empty. */
  createAction?: Action;
}) {
  const Icon = ICONS[reason];
  const copy: Copy =
    reason === "no-data"
      ? labels.noData
      : reason === "no-search"
        ? labels.noSearch
        : reason === "no-filters"
          ? labels.noFilters
          : labels.noSearchFilters;

  let action: Action | null = null;
  if (reason === "no-data") {
    action = createAction ?? null;
  } else if (reason === "no-search") {
    action = onClearSearch ? { label: labels.clearSearch, onClick: onClearSearch } : null;
  } else if (reason === "no-filters") {
    action = onClearFilters ? { label: labels.clearFilters, onClick: onClearFilters } : null;
  } else if (onClearSearch || onClearFilters) {
    action = {
      label: labels.clearAll,
      onClick: () => {
        onClearSearch?.();
        onClearFilters?.();
      },
    };
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-2 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-medium text-foreground">{copy.title}</p>
      {copy.description ? (
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      ) : null}
      {action ? (
        <Button variant="outline" size="sm" onClick={action.onClick} className="mt-1">
          {action.icon ? <action.icon className="h-4 w-4" aria-hidden /> : null}
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
