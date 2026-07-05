"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";

/** One selectable row within a {@link GroupedMultiSelectGroup}. */
export interface GroupedMultiSelectItem {
  /** Stable identity (a permission key, an event type, a notification kind…). */
  value: string;
  /** Primary line — rendered in a mono font (the key / type). */
  primary: string;
  /** Optional muted description line. */
  secondary?: string;
  /**
   * Checkbox mode : an inline marker rendered at the *start* of the
   * secondary line, before the description — e.g. a "Required" badge that
   * explains why a locked row's checkbox is disabled. Kept out of the
   * `secondary` string so it can be styled (a badge, not text) and doesn't
   * pollute the search text.
   */
  secondaryPrefix?: ReactNode;
}

/** A collapsible category of rows. */
export interface GroupedMultiSelectGroup {
  /** Stable identity + React key. */
  key: string;
  /** Human label for the header. */
  label: ReactNode;
  /** Render the label in a mono font (e.g. a raw module name). */
  monoLabel?: boolean;
  /**
   * Checkbox mode : render each row's `primary` line in a mono font.
   * Defaults to true (RBAC keys / webhook event types read as code) ;
   * set false for human-readable labels (e.g. notification event names).
   */
  monoItems?: boolean;
  items: GroupedMultiSelectItem[];
}

/** Translated chrome (kept out of the component per the i18n rule). */
export interface GroupedMultiSelectLabels {
  searchPlaceholder: string;
  searchAria: string;
  /**
   * Checkbox mode group-header count chip. Defaults to `"{selected} / {total}"`
   * so every checkbox-mode caller reads identically ; override only for a
   * genuinely different format (the numbers carry no translatable words).
   */
  count?: (args: { selected: number; total: number }) => string;
  /** aria-label for a group's select-all checkbox — checkbox mode only. */
  toggleAllAria?: (groupLabel: string) => string;
}

/**
 * The searchable, grouped selector shared by the RBAC role editor
 * (permissions by category), the webhook subscription picker (event types
 * by module), and the notification preferences (kinds by category). One
 * bordered container ; one `Collapsible` per group ; a search box filters
 * rows across every group and auto-expands the groups with hits.
 *
 * Two row modes :
 *  - **Checkbox** (default) — a leading checkbox per row + a tri-state
 *    (none / some / all) group header checkbox + a `selected / total` count
 *    chip. Drive it with `isChecked` / `onToggleItem` / `onToggleGroup`.
 *  - **Trailing controls** — pass `renderItemTrailing` to render arbitrary
 *    controls on the right of each row (e.g. per-channel notification
 *    toggles). The leading checkbox + group select-all are dropped ; use
 *    `renderGroupBadge` for an optional header chip.
 *
 * Purely presentational : it owns the search + expand state and delegates
 * *what "checked" means* / *how a toggle mutates the model* to the caller,
 * so a plain `Set<string>` (RBAC), a prefix-subscription draft (webhooks),
 * and a per-kind prefs matrix (notifications) all drive the same shell.
 * Pass the FULL group list ; filtering happens here.
 */
export function GroupedMultiSelect({
  groups,
  isChecked,
  isItemDisabled,
  onToggleItem,
  onToggleGroup,
  renderItemTrailing,
  renderGroupBadge,
  labels,
  renderEmpty,
  className,
}: {
  groups: GroupedMultiSelectGroup[];
  /** Checkbox mode : whether a given item value counts as selected. */
  isChecked?: (value: string) => boolean;
  /** Checkbox mode : whether a row's checkbox is locked (rendered checked
   *  + disabled). Used for forced-on rows the user can't opt out of. */
  isItemDisabled?: (value: string) => boolean;
  /** Checkbox mode : toggle a single row. `group` is provided for models
   *  that need sibling context (e.g. the webhook prefix logic). */
  onToggleItem?: (group: GroupedMultiSelectGroup, value: string, next: boolean) => void;
  /** Checkbox mode : toggle a whole group. `selectAll` is the desired next state. */
  onToggleGroup?: (group: GroupedMultiSelectGroup, selectAll: boolean) => void;
  /** Trailing-controls mode : render controls on the right of each row. */
  renderItemTrailing?: (item: GroupedMultiSelectItem) => ReactNode;
  /** Trailing-controls mode : optional chip rendered in the group header. */
  renderGroupBadge?: (group: GroupedMultiSelectGroup) => ReactNode;
  labels: GroupedMultiSelectLabels;
  /** Rendered inside the container when no group has matching rows.
   *  Receives the trimmed query so callers can distinguish
   *  "no search hits" from "nothing registered". */
  renderEmpty: (query: string) => ReactNode;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const needle = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (needle === "") return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.value.toLowerCase().includes(needle) ||
            it.primary.toLowerCase().includes(needle) ||
            (it.secondary?.toLowerCase().includes(needle) ?? false),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, needle]);

  // While a search is active, expose every group with hits. The ref guard
  // skips re-applying when the user manually collapses a section — the
  // auto-expand only fires on needle change, not on every render.
  const previousNeedle = useRef("");
  useEffect(() => {
    if (needle === previousNeedle.current) return;
    previousNeedle.current = needle;
    if (needle === "") return;
    setOpenGroups(new Set(filtered.map((g) => g.key)));
  }, [needle, filtered]);

  function toggleOpen(key: string, open: boolean) {
    setOpenGroups((cur) => {
      const out = new Set(cur);
      if (open) out.add(key);
      else out.delete(key);
      return out;
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchAria}
          className="pl-8"
        />
      </div>
      <div className="space-y-2 rounded-md border border-border p-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {renderEmpty(search.trim())}
          </div>
        ) : (
          filtered.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              isChecked={isChecked}
              isItemDisabled={isItemDisabled}
              open={openGroups.has(group.key)}
              onOpenChange={(next) => toggleOpen(group.key, next)}
              onToggleItem={onToggleItem}
              onToggleGroup={onToggleGroup}
              renderItemTrailing={renderItemTrailing}
              renderGroupBadge={renderGroupBadge}
              labels={labels}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** Shared default for the checkbox-mode count chip so every caller reads
 *  identically ("3 / 8") unless it deliberately overrides `labels.count`. */
function defaultCount({ selected, total }: { selected: number; total: number }): string {
  return `${selected} / ${total}`;
}

function GroupSection({
  group,
  isChecked,
  isItemDisabled,
  open,
  onOpenChange,
  onToggleItem,
  onToggleGroup,
  renderItemTrailing,
  renderGroupBadge,
  labels,
}: {
  group: GroupedMultiSelectGroup;
  isChecked?: (value: string) => boolean;
  isItemDisabled?: (value: string) => boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleItem?: (group: GroupedMultiSelectGroup, value: string, next: boolean) => void;
  onToggleGroup?: (group: GroupedMultiSelectGroup, selectAll: boolean) => void;
  renderItemTrailing?: (item: GroupedMultiSelectItem) => ReactNode;
  renderGroupBadge?: (group: GroupedMultiSelectGroup) => ReactNode;
  labels: GroupedMultiSelectLabels;
}) {
  const trailingMode = !!renderItemTrailing;
  const total = group.items.length;
  const selectedCount = isChecked
    ? group.items.reduce((acc, it) => acc + (isChecked(it.value) ? 1 : 0), 0)
    : 0;
  const state: "none" | "some" | "all" =
    selectedCount === 0 ? "none" : selectedCount === total ? "all" : "some";
  const labelText = typeof group.label === "string" ? group.label : group.key;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
        {!trailingMode && isChecked && (
          <Checkbox
            checked={state === "all"}
            indeterminate={state === "some"}
            onChange={() => onToggleGroup?.(group, state !== "all")}
            aria-label={labels.toggleAllAria?.(labelText) ?? labelText}
            onClick={(event) => event.stopPropagation()}
          />
        )}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center justify-between gap-2 rounded-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              )}
              <span className={group.monoLabel ? "font-mono" : undefined}>{group.label}</span>
            </span>
            {trailingMode ? (
              renderGroupBadge?.(group)
            ) : (
              <Badge
                variant={state === "all" ? "primary" : "secondary"}
                size="sm"
                className="shrink-0"
              >
                {(labels.count ?? defaultCount)({ selected: selectedCount, total })}
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="space-y-1 px-2 pb-1 pt-1">
          {group.items.map((it) => (
            <li key={it.value}>
              {trailingMode ? (
                <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block font-medium">{it.primary}</span>
                    {it.secondary && (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {it.secondary}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0">{renderItemTrailing(it)}</span>
                </div>
              ) : (
                (() => {
                  const itemDisabled = isItemDisabled?.(it.value) ?? false;
                  return (
                    <label
                      className={cn(
                        "flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm",
                        itemDisabled ? "cursor-not-allowed" : "cursor-pointer",
                      )}
                    >
                      <Checkbox
                        checked={isChecked?.(it.value) ?? false}
                        disabled={itemDisabled}
                        onChange={(event) => onToggleItem?.(group, it.value, event.target.checked)}
                        aria-label={it.primary}
                      />
                      <span className="flex-1 space-y-0.5">
                        <span
                          className={cn(
                            "block",
                            group.monoItems === false ? "font-medium" : "font-mono text-xs",
                          )}
                        >
                          {it.primary}
                        </span>
                        {(it.secondaryPrefix || it.secondary) && (
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                            {it.secondaryPrefix}
                            {it.secondary && <span>{it.secondary}</span>}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })()
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
