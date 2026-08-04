"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { COLUMN_WIDTH_PX, KANBAN_PRIORITIES, type BoardDef } from "@monark/kanban/client";
import type { FilterNode } from "@monark/query/contracts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ListMobileBar } from "@/components/patterns";
import { type QueryFieldMeta } from "@/components/query/query-bar";
import { QueryChipBar } from "@/components/query/query-chip-bar";
import { useMqlLabels } from "@/components/query/use-mql-labels";
import { ViewsMenu } from "./views-menu";
import { trpc } from "@/lib/trpc";
import { KanbanBoardView } from "./kanban-board-view";
import { BoardDialog } from "./board-dialog";
import { CardEditor, type EditableCard } from "./card-editor";

type CardEditorState =
  | null
  | { mode: "create"; columnId: string }
  | { mode: "edit"; card: EditableCard };

export function KanbanShell({
  initialBoards,
  canCreate,
  canEdit,
  canDelete,
  canManage,
  queryEnabled,
}: {
  initialBoards: BoardDef[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
  queryEnabled: boolean;
}) {
  const t = useTranslations("kanban");
  const mqlLabels = useMqlLabels();
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  // Server-rendered boards paint first ; the client query swaps in once it
  // resolves (and after an invalidate on create / delete).
  const boardsQuery = trpc.kanban.boards.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const boards: BoardDef[] = useMemo(
    () =>
      boardsQuery.data
        ? boardsQuery.data.map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description ?? undefined,
            color: b.color ?? undefined,
          }))
        : initialBoards,
    [boardsQuery.data, initialBoards],
  );

  const boardParam = searchParams.get("board");
  const selectedBoardId =
    boardParam && boards.some((b) => b.id === boardParam) ? boardParam : (boards[0]?.id ?? null);
  const selectedBoard = boards.find((b) => b.id === selectedBoardId) ?? null;

  const [boardDialog, setBoardDialog] = useState<null | { mode: "create" } | { mode: "edit" }>(
    null,
  );
  const [cardEditor, setCardEditor] = useState<CardEditorState>(null);
  const [queryText, setQueryText] = useState("");
  const [queryTree, setQueryTree] = useState<FilterNode | null>(null);

  const boardQuery = trpc.kanban.boards.get.useQuery(
    { id: selectedBoardId! },
    { enabled: !!selectedBoardId, refetchOnWindowFocus: false },
  );

  // Org members for the assignee picker + card avatars (fetched once).
  const membersQuery = trpc.kanban.members.useQuery(undefined, {
    enabled: boards.length > 0,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const members = membersQuery.data ?? [];

  // Query-bar field metadata, built client-side from the board's columns + org
  // members + i18n labels (priority options from the static severity order).
  // Only assembled behind the kanban.query flag.
  const queryFields = useMemo<QueryFieldMeta[]>(() => {
    if (!queryEnabled) return [];
    const columns = boardQuery.data?.columns ?? [];
    const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName ?? m.email }));
    return [
      { key: "title", label: t("query.fields.title"), kind: "text" },
      { key: "description", label: t("query.fields.description"), kind: "text" },
      {
        key: "status",
        label: t("query.fields.status"),
        kind: "select",
        options: columns.map((c) => ({ value: c.id, label: c.name })),
      },
      {
        key: "assignee",
        label: t("query.fields.assignee"),
        kind: "multiSelect",
        options: memberOptions,
        userValued: true,
      },
      {
        key: "reviewer",
        label: t("query.fields.reviewer"),
        kind: "multiSelect",
        options: memberOptions,
        userValued: true,
      },
      {
        key: "priority",
        label: t("query.fields.priority"),
        kind: "orderedSelect",
        options: KANBAN_PRIORITIES.map((p) => ({ value: p, label: t(`card.priority.${p}`) })),
      },
      { key: "due", label: t("query.fields.due"), kind: "date" },
      { key: "estimate", label: t("query.fields.estimate"), kind: "number" },
    ];
  }, [queryEnabled, boardQuery.data?.columns, members, t]);

  // When a filter is active, load the board's cards through the filtered
  // `cards.list` ; otherwise the unfiltered set from `boards.get` is used.
  const filtering = queryEnabled && queryTree != null;
  const cardsQuery = trpc.kanban.cards.list.useQuery(
    { boardId: selectedBoardId!, filter: queryTree ?? undefined },
    { enabled: filtering && !!selectedBoardId, refetchOnWindowFocus: false },
  );

  const selectBoard = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("board", id);
      router.replace(`/kanban?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const reloadBoard = useCallback(() => {
    if (selectedBoardId) {
      void utils.kanban.boards.get.invalidate({ id: selectedBoardId });
      void utils.kanban.cards.list.invalidate({ boardId: selectedBoardId });
    }
  }, [utils, selectedBoardId]);

  const reloadBoards = useCallback(() => {
    void utils.kanban.boards.list.invalidate();
  }, [utils]);

  // Deep-link: the global search (or any `?card=` link) opens a specific card's
  // editor once its board has loaded, then strips the param so closing the
  // editor doesn't reopen it on the next render.
  const cardParam = searchParams.get("card");
  useEffect(() => {
    if (!cardParam || !boardQuery.data) return;
    const card = boardQuery.data.cards.find((c) => c.id === cardParam);
    if (card) setCardEditor({ mode: "edit", card });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("card");
    router.replace(`/kanban?${params.toString()}`, { scroll: false });
  }, [cardParam, boardQuery.data, router, searchParams]);

  // Toolbar controls, extracted so the desktop row and the mobile bar share one
  // instance each. The switcher trigger + edit pen are siblings inside one
  // bordered pill — never a button nested inside a role="button" (invalid + an
  // AT hazard).
  const boardSwitcher =
    boards.length > 0 ? (
      <div className="flex h-9 min-w-0 items-center rounded-md border border-input bg-background shadow-sm max-md:min-h-11 pointer-coarse:min-h-11">
        {/* modal={false} : this menu opens over the scrollable board (and the
            non-modal card sheet), so a modal menu could leave body
            pointer-events stuck / blow out the mobile viewport. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("shell.selectBoard")}
              className="inline-flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pl-3 pr-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: selectedBoard?.color ?? "hsl(var(--muted-foreground))",
                }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-left md:max-w-[45dvw] md:flex-none">
                {selectedBoard?.name ?? t("shell.selectBoard")}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60dvh] overflow-y-auto">
            {boards.map((b) => (
              <DropdownMenuItem key={b.id} onSelect={() => selectBoard(b.id)}>
                <span
                  className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: b.color ?? "hsl(var(--muted-foreground))" }}
                  aria-hidden
                />
                <span className="truncate">{b.name}</span>
              </DropdownMenuItem>
            ))}
            {canCreate && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setBoardDialog({ mode: "create" })}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  {t("shell.newBoard")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {selectedBoard && canEdit && (
          <button
            type="button"
            aria-label={t("shell.editBoard")}
            title={t("shell.editBoard")}
            onClick={() => setBoardDialog({ mode: "edit" })}
            className="mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    ) : null;

  const queryChipBar =
    queryEnabled && selectedBoard ? (
      <QueryChipBar
        fields={queryFields}
        text={queryText}
        onTextChange={setQueryText}
        onChange={setQueryTree}
        labels={{
          placeholder: t("query.bar.placeholder"),
          invalid: t("query.bar.invalid"),
          fieldsHeading: t("query.bar.fieldsHeading"),
          valuesHeading: t("query.bar.valuesHeading"),
          hint: t("query.bar.hint"),
        }}
        {...mqlLabels}
        className="min-w-0 flex-1"
      />
    ) : null;

  const viewsMenu =
    queryEnabled && selectedBoard ? (
      <ViewsMenu
        boardId={selectedBoard.id}
        fields={queryFields}
        currentQuery={queryTree}
        onPick={setQueryText}
        labels={{
          trigger: t("query.views.trigger"),
          heading: t("query.views.heading"),
          empty: t("query.views.empty"),
          save: t("query.views.save"),
          dialogTitle: t("query.views.dialogTitle"),
          namePlaceholder: t("query.views.namePlaceholder"),
          shareLabel: t("query.views.shareLabel"),
          saveCta: t("query.views.saveCta"),
          cancel: t("query.views.cancel"),
          deleteTitle: t("query.views.deleteTitle"),
          deleteConfirm: t("query.views.deleteConfirm"),
          deleteDescription: t("query.views.deleteDescription"),
          saved: t("query.views.saved"),
          deleted: t("query.views.deleted"),
          loaded: t("query.views.loaded"),
        }}
      />
    ) : null;

  return (
    <>
      {/* Toolbar. Desktop keeps the roomy single row ; on mobile the three
          controls (board switcher · query · saved views) never fight for one
          row : the switcher leads, the query collapses behind 🔍, and the views
          picker sits in the options slot (shared ListMobileBar pattern). */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <div className="hidden items-center gap-2 md:flex">
          {boardSwitcher}
          {queryChipBar}
          {viewsMenu}
        </div>
        <ListMobileBar
          lead={boardSwitcher}
          search={queryChipBar}
          options={viewsMenu}
          searchLabel={t("query.bar.expand")}
          closeLabel={t("query.bar.collapse")}
        />
      </div>

      {/* Body */}
      {boards.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-lg font-semibold">{t("shell.noBoards")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("shell.noBoardsHint")}</p>
          {canCreate && (
            <Button onClick={() => setBoardDialog({ mode: "create" })}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              {t("shell.createFirstBoard")}
            </Button>
          )}
        </div>
      ) : boardQuery.isLoading ? (
        <BoardSkeleton />
      ) : boardQuery.data ? (
        <KanbanBoardView
          columns={boardQuery.data.columns}
          cards={filtering ? (cardsQuery.data ?? []) : boardQuery.data.cards}
          members={members}
          canEdit={canEdit}
          onReload={reloadBoard}
          onAddCard={(columnId) => setCardEditor({ mode: "create", columnId })}
          onOpenCard={(card) => setCardEditor({ mode: "edit", card })}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">{t("shell.boardNotFound")}</p>
        </div>
      )}

      {/* Dialogs */}
      {boardDialog && (
        <BoardDialog
          mode={boardDialog.mode}
          board={boardDialog.mode === "edit" ? selectedBoard : null}
          initialRoleIds={
            boardDialog.mode === "edit"
              ? (boardQuery.data?.board.roleAccess.map((r) => r.roleId) ?? [])
              : []
          }
          canManage={canManage}
          canDelete={canDelete}
          onClose={() => setBoardDialog(null)}
          onCreated={(id) => {
            setBoardDialog(null);
            reloadBoards();
            selectBoard(id);
          }}
          onSaved={() => {
            setBoardDialog(null);
            reloadBoards();
            reloadBoard();
          }}
          onDeleted={() => {
            setBoardDialog(null);
            reloadBoards();
            const next = boards.find((b) => b.id !== selectedBoardId);
            if (next) selectBoard(next.id);
            else router.replace("/kanban", { scroll: false });
          }}
        />
      )}

      {cardEditor && selectedBoard && (
        <CardEditor
          // No `key` here on purpose : `CardEditor` keeps the Sheet mounted and
          // re-seeds only its inner form when the card changes, so switching from
          // one card to another doesn't replay the panel's open animation.
          boardId={selectedBoard.id}
          state={cardEditor}
          members={members}
          columns={boardQuery.data?.columns ?? []}
          canDelete={canDelete}
          onClose={() => setCardEditor(null)}
          onSaved={() => {
            setCardEditor(null);
            reloadBoard();
          }}
        />
      )}
    </>
  );
}

// Mirrors the real board's flat layout : full-height columns sitting flush
// (no gap) on the background, separated by right divider borders, each with an
// underlined header (colour dot + name) and a body of card placeholders.
function BoardSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden border-t border-border">
      {Array.from({ length: 4 }).map((_, colIndex) => (
        <div
          key={colIndex}
          style={{ width: COLUMN_WIDTH_PX }}
          className="flex h-full shrink-0 flex-col border-r border-border"
        >
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2">
            {Array.from({ length: 3 - (colIndex % 2) }).map((__, cardIndex) => (
              <Skeleton key={cardIndex} className="h-24 w-full rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
