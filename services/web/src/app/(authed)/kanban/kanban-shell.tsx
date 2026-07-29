"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Pencil, Plus } from "lucide-react";
import { COLUMN_WIDTH_PX, type BoardDef } from "@monark/kanban/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
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
}: {
  initialBoards: BoardDef[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("kanban");
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

  const selectBoard = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("board", id);
      router.replace(`/kanban?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const reloadBoard = useCallback(() => {
    if (selectedBoardId) void utils.kanban.boards.get.invalidate({ id: selectedBoardId });
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

  return (
    <>
      {/* Toolbar — a single compact combo : the board name + chevron open the
          switcher ; the inline pen (shown when the user may edit) opens the
          board settings. Clicking anywhere outside the pen selects a board. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        {boards.length > 0 && (
          // The switcher trigger and the edit pen are siblings inside one bordered
          // pill — never a button nested inside a role="button" (invalid + a
          // keyboard/AT hazard).
          <div className="flex min-w-0 items-center rounded-md border border-input bg-background shadow-sm">
            {/* modal={false} : this menu opens over the scrollable board (and the
                non-modal card sheet), so a modal menu could leave body
                pointer-events stuck / blow out the mobile viewport. */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("shell.selectBoard")}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md py-1.5 pl-3 pr-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: selectedBoard?.color ?? "hsl(var(--muted-foreground))",
                    }}
                    aria-hidden
                  />
                  <span className="max-w-[45dvw] truncate">
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
        )}
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
          cards={boardQuery.data.cards}
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
