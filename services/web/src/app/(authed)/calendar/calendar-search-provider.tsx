"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { SearchResultsGroup } from "@/components/global-search/search-results-group";
import {
  SEARCH_MIN_QUERY,
  type SearchProviderProps,
} from "@/components/global-search/search-contract";

/** Matches the calendar shell's `?date=` contract (local `YYYY-MM-DD`). */
function formatDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Global-search content provider for the calendar : events matching the query
 * across the caller's accessible calendars, fetched live from the api. Active
 * on `/calendar` (see the search-providers registry). Selecting a result jumps
 * to that event's day with the event pre-opened.
 */
export function CalendarSearchProvider({ query, onNavigate }: SearchProviderProps) {
  const t = useTranslations("globalSearch");
  const locale = useLocale();

  const eventsQuery = trpc.calendar.events.search.useQuery(
    { query },
    { enabled: query.length >= SEARCH_MIN_QUERY },
  );
  const events = eventsQuery.data ?? [];

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }),
    [locale],
  );

  return (
    <SearchResultsGroup
      heading={t("groups.calendar")}
      loading={eventsQuery.isFetching}
      count={events.length}
    >
      {events.map((ev) => {
        const startAt = new Date(ev.startAt);
        return (
          <CommandItem
            key={ev.id}
            value={`event-${ev.id}`}
            onSelect={() =>
              onNavigate(`/calendar?view=day&date=${formatDateParam(startAt)}&event=${ev.id}`)
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
    </SearchResultsGroup>
  );
}
