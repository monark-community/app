"use client";

import { useEffect, useMemo, useState, type HTMLAttributes } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { checklistProgress } from "@monark/common/blocks";
import {
  BoardArea,
  BoardColumn,
  COLUMN_WIDTH_PX,
  KanbanCard,
  type CardPriority,
  type KanbanCardPriority,
} from "@monark/kanban/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/patterns";
import { trpc } from "@/lib/trpc";
import { ColumnEditDialog, type EditableColumn } from "./column-edit-dialog";

// Structural subsets of the tRPC row types — the board view only reads these
// fields (excess properties on the passed rows are fine).
type ColumnRow = {
  id: string;
  boardId: string;
  name: string;
  color: string | null;
  position: number;
  wipLimit: number | null;
};
type CardRow = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  // Block-array card body (JSON) from the API. Read here only to derive the
  // face's checklist progress (via `checklistProgress`) ; the editor owns edits.
  // Optional : an `unknown` field serializes as optional through tRPC.
  description?: unknown;
  assigneeIds: string[];
  reviewerIds: string[];
  dueAt: Date | string | null;
  priority: KanbanCardPriority | null;
  estimate: number | null;
  position: number;
};

type Member = { id: string; displayName: string | null; email: string; avatarUrl: string | null };
type Assignee = { name: string; avatarUrl?: string };

type CardsByColumn = Record<string, CardRow[]>;

function groupCards(columns: ColumnRow[], cards: CardRow[]): CardsByColumn {
  const byColumn: CardsByColumn = {};
  for (const col of columns) byColumn[col.id] = [];
  for (const card of cards) (byColumn[card.columnId] ??= []).push(card);
  for (const id of Object.keys(byColumn)) {
    byColumn[id]!.sort((a, b) => a.position - b.position);
  }
  return byColumn;
}

/** Signature of the server data, so we only re-sync local state when it changes
 *  (not on every render, which would fight an in-flight drag). */
function cardSignature(cards: CardRow[]): string {
  return cards.map((c) => `${c.id}:${c.columnId}:${c.position}`).join(",");
}

// Prefer the droppable the pointer is literally inside. `closestCorners` (the
// old strategy) measured distance to the nearest corner, so hovering a sparse
// column snapped onto a card in the neighbouring column — the "every other
// column won't take a drop" bug. When dragging a *column* we only consider other
// columns (ignore cards). `rectIntersection` covers gaps + the keyboard sensor.
const boardCollision: CollisionDetection = (args) => {
  const draggingColumn = args.active.data.current?.type === "column";
  const scoped = draggingColumn
    ? {
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.type === "column",
        ),
      }
    : args;
  const within = pointerWithin(scoped);
  return within.length > 0 ? within : rectIntersection(scoped);
};

export function KanbanBoardView({
  columns,
  cards,
  members,
  canEdit,
  onReload,
  onAddCard,
  onOpenCard,
}: {
  columns: ColumnRow[];
  cards: CardRow[];
  members: Member[];
  canEdit: boolean;
  onReload: () => void;
  onAddCard: (columnId: string) => void;
  onOpenCard: (card: CardRow) => void;
}) {
  const t = useTranslations("kanban");
  const format = useFormatter();

  const orderedColumns = useMemo(
    () => [...columns].sort((a, b) => a.position - b.position),
    [columns],
  );
  const columnsById = useMemo(
    () => Object.fromEntries(orderedColumns.map((c) => [c.id, c])),
    [orderedColumns],
  );
  const boardId = orderedColumns[0]?.boardId;

  const assigneeById = useMemo(() => {
    const map = new Map<string, Assignee>();
    for (const m of members) {
      map.set(m.id, { name: m.displayName ?? m.email, avatarUrl: m.avatarUrl ?? undefined });
    }
    return map;
  }, [members]);
  const assigneesOf = (card: CardRow): Assignee[] =>
    card.assigneeIds
      .map((id) => assigneeById.get(id))
      .filter((a): a is Assignee => a !== undefined);

  const priorityLabels: Record<KanbanCardPriority, string> = {
    LOW: t("card.priority.LOW"),
    MEDIUM: t("card.priority.MEDIUM"),
    HIGH: t("card.priority.HIGH"),
    CRITICAL: t("card.priority.CRITICAL"),
  };
  const cardPriority = (card: CardRow): CardPriority | undefined =>
    card.priority ? { level: card.priority, label: priorityLabels[card.priority] } : undefined;

  // ── Local, optimistic state (columns order + cards grouping) ──
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"card" | "column" | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const columnSig = orderedColumns.map((c) => c.id).join(",");
  const [columnIds, setColumnIds] = useState<string[]>(() => orderedColumns.map((c) => c.id));
  useEffect(() => {
    if (activeType === "column") return;
    setColumnIds(orderedColumns.map((c) => c.id));
  }, [columnSig, activeType, orderedColumns]);

  const cardSig = cardSignature(cards);
  const [cardsByColumn, setCardsByColumn] = useState<CardsByColumn>(() =>
    groupCards(orderedColumns, cards),
  );
  useEffect(() => {
    if (activeType) return; // don't clobber an in-flight drag
    setCardsByColumn(groupCards(orderedColumns, cards));
  }, [columnSig, cardSig, activeType, orderedColumns, cards]);

  const displayColumns = columnIds
    .map((id) => columnsById[id])
    .filter((c): c is ColumnRow => Boolean(c));

  // ── Dialogs ──
  const [editColumn, setEditColumn] = useState<EditableColumn | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<ColumnRow | null>(null);

  // ── Mutations ──
  const moveMutation = trpc.kanban.cards.move.useMutation({
    onError: onReload,
    onSettled: onReload,
  });
  const reorderColumnsMutation = trpc.kanban.columns.reorder.useMutation({
    onError: onReload,
    onSettled: onReload,
  });
  const deleteColumnMutation = trpc.kanban.columns.delete.useMutation({
    onSuccess: () => {
      setDeletingColumn(null);
      onReload();
    },
    onError: (err) => toast.error(t("column.errorToast", { message: err.message })),
  });

  // Mouse: start on a 6px move (a click stays a click). Touch: require a
  // ~250ms long-press before a drag begins, so a quick swipe scrolls/pans the
  // board instead of grabbing a card (the card no longer sets touch-action:none,
  // so the browser owns the gesture until the press delay elapses). The tolerance
  // aborts the pending drag if the finger travels first — i.e. a scroll.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function columnIdOfCard(cardId: string): string | undefined {
    return Object.keys(cardsByColumn).find((colId) =>
      cardsByColumn[colId]!.some((c) => c.id === cardId),
    );
  }
  function resolveContainer(overId: string): string | undefined {
    if (columnsById[overId]) return overId; // dropped on a column
    return columnIdOfCard(overId); // dropped on a card
  }

  const activeCard =
    activeType === "card" && activeId
      ? Object.values(cardsByColumn)
          .flat()
          .find((c) => c.id === activeId)
      : null;
  const activeColumn = activeType === "column" && activeId ? columnsById[activeId] : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setActiveType(event.active.data.current?.type === "column" ? "column" : "card");
  }

  // Highlight-only: light the whole column the pointer resolves to (card drags).
  function onDragOver(event: DragOverEvent) {
    if (event.active.data.current?.type === "column") return; // columns animate on their own
    const overId = event.over ? String(event.over.id) : null;
    setOverColumnId(overId ? (resolveContainer(overId) ?? null) : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const type = active.data.current?.type === "column" ? "column" : "card";
    setActiveId(null);
    setActiveType(null);
    setOverColumnId(null);
    if (!over) return;
    const activeIdStr = String(active.id);
    const overId = String(over.id);

    if (type === "column") {
      const oldIndex = columnIds.indexOf(activeIdStr);
      const newIndex = columnIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const nextIds = arrayMove(columnIds, oldIndex, newIndex);
      setColumnIds(nextIds);
      if (boardId) reorderColumnsMutation.mutate({ boardId, orderedIds: nextIds });
      return;
    }

    // Card move — resolved entirely on drop from stable committed state.
    const source = columnIdOfCard(activeIdStr);
    const target = resolveContainer(overId);
    if (!source || !target) return;
    const overIsColumn = Boolean(columnsById[overId]);
    const sourceItems = cardsByColumn[source] ?? [];
    const moving = sourceItems.find((c) => c.id === activeIdStr);
    if (!moving) return;

    let next: CardsByColumn;
    let orderedIdsInTarget: string[];
    if (source === target) {
      const oldIndex = sourceItems.findIndex((c) => c.id === activeIdStr);
      const newIndex = overIsColumn
        ? sourceItems.length - 1
        : sourceItems.findIndex((c) => c.id === overId);
      if (newIndex < 0 || oldIndex === newIndex) return;
      const reordered = arrayMove(sourceItems, oldIndex, newIndex);
      next = { ...cardsByColumn, [source]: reordered };
      orderedIdsInTarget = reordered.map((c) => c.id);
    } else {
      const targetItems = cardsByColumn[target] ?? [];
      const overIndex = overIsColumn
        ? targetItems.length
        : targetItems.findIndex((c) => c.id === overId);
      const insertAt = overIndex < 0 ? targetItems.length : overIndex;
      const newTarget = [
        ...targetItems.slice(0, insertAt),
        { ...moving, columnId: target },
        ...targetItems.slice(insertAt),
      ];
      next = {
        ...cardsByColumn,
        [source]: sourceItems.filter((c) => c.id !== activeIdStr),
        [target]: newTarget,
      };
      orderedIdsInTarget = newTarget.map((c) => c.id);
    }
    setCardsByColumn(next);
    moveMutation.mutate({ id: activeIdStr, toColumnId: target, orderedIdsInTarget });
  }

  const menuLabels = {
    menuAria: t("column.menuAria"),
    reorderAria: t("column.reorderAria"),
    addCard: t("shell.addCard"),
    edit: t("column.edit"),
    delete: t("column.delete"),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setActiveType(null);
        setOverColumnId(null);
      }}
    >
      <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
        <BoardArea>
          {displayColumns.map((col) => (
            <SortableColumn
              key={col.id}
              column={col}
              cards={cardsByColumn[col.id] ?? []}
              isActive={overColumnId === col.id}
              canEdit={canEdit}
              assigneesOf={assigneesOf}
              priorityOf={cardPriority}
              menuLabels={menuLabels}
              onAddCard={() => onAddCard(col.id)}
              onOpenCard={onOpenCard}
              onEdit={() =>
                setEditColumn({
                  id: col.id,
                  name: col.name,
                  color: col.color,
                  wipLimit: col.wipLimit,
                })
              }
              onDelete={() => setDeletingColumn(col)}
            />
          ))}
          {canEdit && boardId && (
            <AddColumn
              boardId={boardId}
              labels={{
                add: t("column.addColumn"),
                placeholder: t("column.addColumnPlaceholder"),
                save: t("column.save"),
                cancel: t("column.cancel"),
              }}
              onCreated={onReload}
            />
          )}
        </BoardArea>
      </SortableContext>

      <DragOverlay>
        {activeColumn ? (
          <div style={{ width: COLUMN_WIDTH_PX }} className="rotate-1 opacity-90">
            <BoardColumn
              name={activeColumn.name}
              count={(cardsByColumn[activeColumn.id] ?? []).length}
              color={activeColumn.color ?? undefined}
              wipLimit={activeColumn.wipLimit ?? undefined}
            >
              {(cardsByColumn[activeColumn.id] ?? []).slice(0, 4).map((card) => (
                <KanbanCard
                  key={card.id}
                  title={card.title}
                  assignees={assigneesOf(card)}
                  priority={cardPriority(card)}
                  estimate={card.estimate ?? undefined}
                  checklist={checklistProgress(card.description)}
                  {...dueProps(card, format)}
                />
              ))}
            </BoardColumn>
          </div>
        ) : activeCard ? (
          <KanbanCard
            title={activeCard.title}
            assignees={assigneesOf(activeCard)}
            priority={cardPriority(activeCard)}
            estimate={activeCard.estimate ?? undefined}
            checklist={checklistProgress(activeCard.description)}
            isOverlay
            {...dueProps(activeCard, format)}
          />
        ) : null}
      </DragOverlay>

      {editColumn && (
        <ColumnEditDialog
          column={editColumn}
          onClose={() => setEditColumn(null)}
          onSaved={() => {
            setEditColumn(null);
            onReload();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deletingColumn}
        onOpenChange={(open) => !open && setDeletingColumn(null)}
        title={t("columns.deleteConfirmTitle")}
        description={t("columns.deleteConfirmBody")}
        cancelLabel={t("columns.cancel")}
        confirmLabel={t("columns.delete")}
        isPending={deleteColumnMutation.isPending}
        onConfirm={() => {
          if (deletingColumn) deleteColumnMutation.mutate({ id: deletingColumn.id });
        }}
      />
    </DndContext>
  );
}

function SortableColumn({
  column,
  cards,
  isActive,
  canEdit,
  assigneesOf,
  priorityOf,
  menuLabels,
  onAddCard,
  onOpenCard,
  onEdit,
  onDelete,
}: {
  column: ColumnRow;
  cards: CardRow[];
  isActive: boolean;
  canEdit: boolean;
  assigneesOf: (card: CardRow) => Assignee[];
  priorityOf: (card: CardRow) => CardPriority | undefined;
  menuLabels: {
    menuAria: string;
    reorderAria: string;
    addCard: string;
    edit: string;
    delete: string;
  };
  onAddCard: () => void;
  onOpenCard: (card: CardRow) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: "column" },
  });

  // The grip sits at the far left, before the colour dot, and reveals on header
  // hover (always shown on touch, where there's no hover). It collapses to zero
  // width when hidden so the dot reads as flush-left at rest instead of sitting
  // behind a reserved gap. It — not the whole header — is the drag handle, so
  // clicking the name / count / menu never starts a column drag.
  const dragHandle = canEdit ? (
    <button
      type="button"
      aria-label={menuLabels.reorderAria}
      className="flex w-0 shrink-0 cursor-grab items-center justify-center overflow-hidden rounded text-muted-foreground opacity-0 transition-all hover:text-foreground focus-visible:w-5 focus-visible:opacity-100 group-hover/hdr:w-5 group-hover/hdr:opacity-100 active:cursor-grabbing [@media(pointer:coarse)]:w-5 [@media(pointer:coarse)]:opacity-100"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  ) : undefined;

  return (
    <div
      ref={setNodeRef}
      className="h-full"
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
    >
      <BoardColumn
        name={column.name}
        count={cards.length}
        color={column.color ?? undefined}
        wipLimit={column.wipLimit ?? undefined}
        isOver={isActive}
        dragHandle={dragHandle}
        headerRight={
          canEdit ? (
            <ColumnMenu
              labels={menuLabels}
              onAddCard={onAddCard}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : null
        }
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              assignees={assigneesOf(card)}
              priority={priorityOf(card)}
              onOpen={() => onOpenCard(card)}
            />
          ))}
        </SortableContext>
        {/* Card-like "add card" : taller than a text button, dashed like a
            placeholder card, sits below the last card. Revealed on column hover
            (desktop) and always shown on touch. */}
        {canEdit && (
          <button
            type="button"
            onClick={onAddCard}
            className="flex w-full shrink-0 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-3 text-left text-sm text-muted-foreground opacity-0 transition hover:border-foreground/30 hover:text-foreground focus-visible:opacity-100 group-hover/col:opacity-100 [@media(pointer:coarse)]:opacity-100"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            {menuLabels.addCard}
          </button>
        )}
      </BoardColumn>
    </div>
  );
}

// Trailing "add column" slot (the board switcher's old "Columns" dialog is
// gone ; add-column lives on the board, edit/rename/reorder/WIP on the headers).
// Collapsed it's a dashed ghost ; expanded, an inline name field (Enter saves,
// Escape cancels), created at the end of the board.
function AddColumn({
  boardId,
  labels,
  onCreated,
}: {
  boardId: string;
  labels: { add: string; placeholder: string; save: string; cancel: string };
  onCreated: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const createMutation = trpc.kanban.columns.create.useMutation({
    onSuccess: () => {
      setName("");
      setAdding(false);
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    createMutation.mutate({ boardId, name: trimmed });
  }

  function cancel() {
    setAdding(false);
    setName("");
  }

  return (
    <div style={{ width: COLUMN_WIDTH_PX }} className="shrink-0 border-l border-border p-2">
      {adding ? (
        <div className="rounded-md border border-border bg-background p-2">
          <Input
            autoFocus
            aria-label={labels.placeholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                cancel();
              }
            }}
            placeholder={labels.placeholder}
            maxLength={80}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={submit} disabled={!name.trim() || createMutation.isPending}>
              {labels.save}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel}>
              {labels.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {labels.add}
        </button>
      )}
    </div>
  );
}

function ColumnMenu({
  labels,
  onAddCard,
  onEdit,
  onDelete,
}: {
  labels: { menuAria: string; addCard: string; edit: string; delete: string };
  onAddCard: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    // modal={false} : the column menu opens over the scrollable board / non-modal
    // card sheet, so a modal menu risks a stuck body pointer-events freeze.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={labels.menuAria}
          // Stop the pointer-down from starting a column drag (the header is the
          // drag handle) and the click from bubbling to it.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onAddCard}>
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          {labels.addCard}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className="mr-2 h-4 w-4" aria-hidden />
          {labels.edit}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
          {labels.delete}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortableCard({
  card,
  assignees,
  priority,
  onOpen,
}: {
  card: CardRow;
  assignees: Assignee[];
  priority?: CardPriority;
  onOpen: () => void;
}) {
  const format = useFormatter();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card" },
  });
  // The card is both the drag handle and the open target. dnd-kit's `attributes`
  // already make it a focusable `role="button"`, but its keyboard sensor claims
  // Enter + Space to start a drag, leaving no key to OPEN the card. Compose the
  // handler so Enter opens and Space is left to dnd-kit for a keyboard drag.
  const dragProps: HTMLAttributes<HTMLDivElement> = {
    ...attributes,
    ...listeners,
    onKeyDown: (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onOpen();
        return;
      }
      listeners?.onKeyDown?.(e);
    },
  };
  return (
    <KanbanCard
      title={card.title}
      assignees={assignees}
      priority={priority}
      estimate={card.estimate ?? undefined}
      checklist={checklistProgress(card.description)}
      isDragging={isDragging}
      cardRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dragProps={dragProps}
      onOpen={onOpen}
      {...dueProps(card, format)}
    />
  );
}

// Format the due date into a short label + overdue flag for the card footer.
// Uses next-intl's formatter so the month name tracks the app locale (en/fr),
// not the browser's.
function dueProps(
  card: CardRow,
  format: ReturnType<typeof useFormatter>,
): { dueLabel?: string; dueOverdue?: boolean } {
  if (!card.dueAt) return {};
  const date = card.dueAt instanceof Date ? card.dueAt : new Date(card.dueAt);
  if (isNaN(date.getTime())) return {};
  const label = format.dateTime(date, { month: "short", day: "numeric" });
  return { dueLabel: label, dueOverdue: date.getTime() < Date.now() };
}
