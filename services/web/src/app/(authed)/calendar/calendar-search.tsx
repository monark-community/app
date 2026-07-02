"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { CalendarDef } from "@monark/calendar/contracts";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export function CalendarSearch({
  open,
  onClose,
  onNavigate,
  calendars,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (date: Date, eventId: string) => void;
  calendars: CalendarDef[];
}) {
  const t = useTranslations("calendar.search");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchQuery = trpc.calendar.events.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 },
  );

  const calendarMap = Object.fromEntries(calendars.map((c) => [c.id, c]));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0" aria-label={t("label")}>
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("placeholder")}
            className="h-12 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {debouncedQuery.length < 2 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("typeToSearch")}
            </p>
          ) : searchQuery.isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("searching")}</p>
          ) : !searchQuery.data?.length ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            searchQuery.data.map((ev) => {
              const cal = calendarMap[ev.calendarId];
              const startAt = new Date(ev.startAt);
              const dateLabel = new Intl.DateTimeFormat(locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                ...(ev.eventType !== "ALL_DAY" ? { hour: "2-digit", minute: "2-digit" } : {}),
              }).format(startAt);
              return (
                <button
                  key={ev.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => {
                    onNavigate(startAt, ev.id);
                    onClose();
                  }}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${!cal?.color ? "bg-primary" : ""}`}
                    style={cal?.color ? { backgroundColor: cal.color } : {}}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{ev.title}</span>
                    <span className="block truncate text-xs capitalize text-muted-foreground">
                      {dateLabel}
                    </span>
                  </span>
                  {cal?.name && (
                    <span className="shrink-0 text-xs text-muted-foreground">{cal.name}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
