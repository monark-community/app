"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { SEARCH_PROVIDERS } from "./search-providers";
import { SEARCH_MIN_QUERY } from "./search-contract";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * The global command palette body. Two kinds of result:
 *   1. Contextual content — the current section's entities, contributed by the
 *      registered {@link SEARCH_PROVIDERS} active on this path (calendar events,
 *      kanban cards, data records, …). Each provider owns its own fetch + group.
 *   2. Navigation — a "Go to" list of app destinations (derived from the drawer
 *      nav) filtered by the query.
 *
 * cmdk's built-in filtering is disabled (`shouldFilter={false}`) : content
 * results are filtered server-side and nav results are filtered here, so we
 * render exactly what should show.
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
  const pathname = usePathname();

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

  const activeProviders = SEARCH_PROVIDERS.filter((p) => p.isActive(pathname));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false} label={t("label")}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>

        {open &&
          canSearch &&
          activeProviders.map((provider) => (
            <provider.Results key={provider.id} query={debounced} onNavigate={go} />
          ))}

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
