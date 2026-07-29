"use client";

import { useTranslations } from "next-intl";
import { SquareKanban } from "lucide-react";
import { CommandItem } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { SearchResultsGroup } from "@/components/global-search/search-results-group";
import {
  SEARCH_MIN_QUERY,
  type SearchProviderProps,
} from "@/components/global-search/search-contract";

/**
 * Global-search content provider for kanban : cards matching the query across
 * every board the caller may see (server-scoped to accessible boards). Active
 * on `/kanban`. Selecting a result opens the card's board with the card
 * pre-opened (the shell reads `?card=` and opens the editor).
 */
export function KanbanSearchProvider({ query, onNavigate }: SearchProviderProps) {
  const t = useTranslations("globalSearch");

  const cardsQuery = trpc.kanban.cards.search.useQuery(
    { query },
    { enabled: query.length >= SEARCH_MIN_QUERY },
  );
  const cards = cardsQuery.data ?? [];

  return (
    <SearchResultsGroup
      heading={t("groups.kanban")}
      loading={cardsQuery.isFetching}
      count={cards.length}
    >
      {cards.map((card) => (
        <CommandItem
          key={card.id}
          value={`card-${card.id}`}
          onSelect={() => onNavigate(`/kanban?board=${card.boardId}&card=${card.id}`)}
        >
          <SquareKanban className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{card.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{card.boardName}</span>
        </CommandItem>
      ))}
    </SearchResultsGroup>
  );
}
