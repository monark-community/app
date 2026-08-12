"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import {
  BookText,
  CalendarDays,
  Database,
  Search,
  SquareKanban,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { SEARCH_ROUTES } from "./routes";
import { SEARCH_MIN_QUERY } from "./search-contract";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

// Fallback icon per source group (a hit's own glyph, e.g. a wiki page's emoji,
// wins when present). A new module's source adds its `groupId` here + a
// `globalSearch.groups.<groupId>` heading ; unknown groups get the search glyph.
const GROUP_ICON: Record<string, LucideIcon> = {
  wiki: BookText,
  kanban: SquareKanban,
  calendar: CalendarDays,
  data: Database,
  automation: Workflow,
};

/**
 * The global command palette body. One aggregating query (`search.global`) fans
 * out across every registered search source (server-side, RBAC-scoped per
 * source) and returns results grouped by module — so search is **global**, not
 * tied to the current section. Below the content groups sits a "Go to" list of
 * app destinations (from the drawer nav) filtered here.
 *
 * cmdk's built-in filtering is off (`shouldFilter={false}`) : content is filtered
 * server-side and nav is filtered here, so we render exactly what should show.
 */
export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("globalSearch");
  const tRoot = useTranslations();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 250);
  const canSearch = debounced.length >= SEARCH_MIN_QUERY;

  // Clear the field each time the palette opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const isAdminQuery = trpc.rbac.isAdmin.useQuery(undefined, {
    enabled: open,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const isAdmin = isAdminQuery.data === true;

  const searchQuery = trpc.search.global.useQuery(
    { query: debounced },
    { enabled: open && canSearch, placeholderData: keepPreviousData, refetchOnWindowFocus: false },
  );
  const groups = canSearch ? (searchQuery.data ?? []) : [];

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const routes = SEARCH_ROUTES.filter((r) => !r.adminOnly || isAdmin);
  const navNeedle = query.trim().toLowerCase();
  const navMatches =
    navNeedle.length === 0
      ? routes
      : routes.filter((r) => tRoot(r.labelKey).toLowerCase().includes(navNeedle));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false} label={t("label")}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>
          {canSearch && searchQuery.isFetching ? t("searching") : t("empty")}
        </CommandEmpty>

        {groups.map((group) => {
          const GroupIcon = GROUP_ICON[group.groupId] ?? Search;
          return (
            <CommandGroup key={group.groupId} heading={t(`groups.${group.groupId}`)}>
              {group.hits.map((hit) => (
                <CommandItem
                  key={`${group.groupId}-${hit.id}`}
                  value={`${group.groupId}-${hit.id}`}
                  onSelect={() => go(hit.href)}
                >
                  {hit.icon ? (
                    <span aria-hidden>{hit.icon}</span>
                  ) : (
                    <GroupIcon className="text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="ml-2 shrink-0 truncate text-xs text-muted-foreground">
                      {hit.subtitle}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {navMatches.length > 0 && (
          <CommandGroup heading={t("groups.navigation")}>
            {navMatches.map((r) => {
              const Icon = r.icon;
              return (
                <CommandItem key={r.id} value={`nav-${r.id}`} onSelect={() => go(r.href)}>
                  <Icon className="text-muted-foreground" />
                  <span>{tRoot(r.labelKey)}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
