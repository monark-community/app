"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
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
const MAX_RESULTS = 8;

type Section = "projects" | "industries" | "calendar";

/** Which section's entities are "most relevant" for the current route. */
function sectionOf(pathname: string): Section | null {
  if (pathname.startsWith("/data/projects")) return "projects";
  if (pathname.startsWith("/data/industries")) return "industries";
  if (pathname.startsWith("/calendar")) return "calendar";
  return null;
}

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
 *   1. Contextual — the current section's entities (projects / industries
 *      / calendar events), fetched live from the api.
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
  const section = sectionOf(pathname);

  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 250);
  const canSearch = debounced.length >= MIN_QUERY;

  // Clear the field each time the palette opens.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Only the query for the current section runs, and only while the
  // palette is open with a long-enough term.
  const projectsQuery = trpc.projects.list.useQuery(
    { search: debounced },
    {
      enabled: open && section === "projects" && canSearch,
      placeholderData: keepPreviousData,
    },
  );
  const industriesQuery = trpc.projects.industries.list.useQuery(
    { search: debounced, limit: MAX_RESULTS },
    {
      enabled: open && section === "industries" && canSearch,
      placeholderData: keepPreviousData,
    },
  );
  const eventsQuery = trpc.calendar.events.search.useQuery(
    { query: debounced },
    { enabled: open && section === "calendar" && canSearch },
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

  // Industries are searched + paged server-side (active rows only) ; take the
  // first page as-is.
  const industriesFiltered = useMemo(
    () => (canSearch ? (industriesQuery.data?.items ?? []) : []),
    [industriesQuery.data, canSearch],
  );

  const contextLoading =
    (section === "projects" && projectsQuery.isFetching) ||
    (section === "industries" && industriesQuery.isFetching) ||
    (section === "calendar" && eventsQuery.isFetching);

  // Number of contextual results for the active section, so we can suppress the
  // group heading entirely when a search comes back empty (otherwise the section
  // title would sit under "No results found.").
  const contextCount =
    section === "projects"
      ? Math.min((projectsQuery.data?.items ?? []).length, MAX_RESULTS)
      : section === "industries"
        ? industriesFiltered.length
        : section === "calendar"
          ? (eventsQuery.data ?? []).length
          : 0;

  // Only surface the "Searching…" row when the fetch is both slow (> 400ms)
  // and we have nothing to show yet — keepPreviousData means a projects
  // refetch keeps its old rows on screen, so there's no gap to fill.
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

        {section && canSearch && (contextCount > 0 || showSearching) && (
          <CommandGroup heading={t(`groups.${section}`)}>
            {showSearching && (
              <CommandItem value="__loading" disabled>
                {t("searching")}
              </CommandItem>
            )}

            {section === "projects" &&
              (projectsQuery.data?.items ?? []).slice(0, MAX_RESULTS).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project-${p.id}`}
                  onSelect={() => go(`/data/projects?project=${p.id}`)}
                >
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.slug}</span>
                </CommandItem>
              ))}

            {section === "industries" &&
              industriesFiltered.map((ind) => (
                <CommandItem
                  key={ind.id}
                  value={`industry-${ind.id}`}
                  onSelect={() => go(`/data/industries?industry=${ind.id}`)}
                >
                  <span className="min-w-0 flex-1 truncate">{ind.displayName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ind.slug}</span>
                </CommandItem>
              ))}

            {section === "calendar" &&
              (eventsQuery.data ?? []).map((ev) => {
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
