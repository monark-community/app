"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
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

const MIN_QUERY = 2;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * True only once `active` has stayed true continuously for `delayMs`.
 * Flips back to false the instant `active` clears. Used to gate the
 * "Searching…" row so fast responses never flash it (most loads under
 * the threshold resolve before it would ever show).
 */
function useDelayed(active: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return;
    }
    const id = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(id);
  }, [active, delayMs]);
  return active && elapsed;
}

/** Matches the calendar shell's `?date=` contract (local `YYYY-MM-DD`). */
function formatDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The global command palette body. Two result groups:
 *   1. Contextual — the current section's entities. Today only the calendar
 *      contributes here (its events, fetched live from the api) ; other
 *      surfaces are reached via the navigation group.
 *   2. Navigation — a "Go to" list of app sections filtered by the query.
 *
 * cmdk's built-in filtering is disabled (`shouldFilter={false}`) : the
 * contextual results are already filtered server-side and the nav results
 * are filtered here, so we render exactly what should show.
 */
export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("globalSearch");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const inCalendar = pathname.startsWith("/calendar");

  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 250);
  const canSearch = debounced.length >= MIN_QUERY;

  // Clear the field each time the palette opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // The contextual query runs only on the calendar, and only while the palette
  // is open with a long-enough term.
  const eventsQuery = trpc.calendar.events.search.useQuery(
    { query: debounced },
    { enabled: open && inCalendar && canSearch },
  );

  const isAdminQuery = trpc.rbac.isAdmin.useQuery(undefined, {
    enabled: open,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const isAdmin = isAdminQuery.data === true;

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const contextLoading = inCalendar && eventsQuery.isFetching;

  // Number of contextual results, so we can suppress the group heading entirely
  // when a search comes back empty (otherwise the section title would sit under
  // "No results found.").
  const contextCount = inCalendar ? events.length : 0;

  // Only surface the "Searching…" row when the fetch is both slow (> 400ms) and
  // we have nothing to show yet.
  const showSearching = useDelayed(contextLoading, 400) && contextCount === 0;

  const routes = SEARCH_ROUTES.filter((r) => !r.adminOnly || isAdmin);
  const navNeedle = query.trim().toLowerCase();
  const navMatches =
    navNeedle.length === 0
      ? routes
      : routes.filter((r) => t(`routes.${r.id}`).toLowerCase().includes(navNeedle));

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }),
    [locale],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false} label={t("label")}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>

        {inCalendar && canSearch && (contextCount > 0 || showSearching) && (
          <CommandGroup heading={t("groups.calendar")}>
            {showSearching && (
              <CommandItem value="__loading" disabled>
                {t("searching")}
              </CommandItem>
            )}

            {events.map((ev) => {
              const startAt = new Date(ev.startAt);
              return (
                <CommandItem
                  key={ev.id}
                  value={`event-${ev.id}`}
                  onSelect={() =>
                    go(`/calendar?view=day&date=${formatDateParam(startAt)}&event=${ev.id}`)
                  }
                >
                  <CalendarDays className="text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {dateFmt.format(startAt)}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {navMatches.length > 0 && (
          <CommandGroup heading={t("groups.navigation")}>
            {navMatches.map((r) => {
              const Icon = r.icon;
              return (
                <CommandItem key={r.id} value={`nav-${r.id}`} onSelect={() => go(r.href)}>
                  <Icon className="text-muted-foreground" />
                  <span>{t(`routes.${r.id}`)}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
