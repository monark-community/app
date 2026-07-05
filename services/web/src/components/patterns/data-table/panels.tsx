"use client";

import type { ComponentType, Dispatch, SetStateAction } from "react";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  GripVertical,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataTableSortLabels } from "./types";

/** A column offered in the sorting panel: id + already-translated header. */
export interface SortableField {
  id: string;
  header: string;
}

/** A data column listed in the columns panel. */
export interface ColumnField {
  id: string;
  header: string;
  canHide: boolean;
}

function usePanelSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/**
 * The sorting editor (multi-column ; `sorting` is an ordered priority list) :
 * active fields with a drag handle to reprioritize, a direction toggle, and a
 * remove button, plus an "add sort field" section for the rest. Hosted in a
 * Popover — not a DropdownMenu — because dnd-kit's pointer-drag fights a
 * menu's item / roving-focus semantics.
 */
export function SortingPanel({
  fields,
  sorting,
  setSorting,
  labels,
}: {
  fields: SortableField[];
  sorting: SortingState;
  setSorting: Dispatch<SetStateAction<SortingState>>;
  labels: DataTableSortLabels;
}) {
  const sensors = usePanelSensors();
  const activeIds = new Set(sorting.map((s) => s.id));
  const active = sorting.filter((s) => fields.some((f) => f.id === s.id));
  const remaining = fields.filter((f) => !activeIds.has(f.id));

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    setSorting((prev) => {
      const from = prev.findIndex((s) => s.id === dragged.id);
      const to = prev.findIndex((s) => s.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  return (
    <div className="flex flex-col">
      {active.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={active.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {active.map((s) => (
                <SortFieldRow
                  key={s.id}
                  id={s.id}
                  label={fields.find((f) => f.id === s.id)?.header ?? s.id}
                  desc={s.desc}
                  ascendingLabel={labels.ascending}
                  descendingLabel={labels.descending}
                  removeLabel={labels.remove}
                  onToggleDirection={() =>
                    setSorting((prev) =>
                      prev.map((entry) =>
                        entry.id === s.id ? { ...entry, desc: !entry.desc } : entry,
                      ),
                    )
                  }
                  onRemove={() => setSorting((prev) => prev.filter((entry) => entry.id !== s.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {remaining.length > 0 && (
        <>
          {active.length > 0 && <div className="my-1 h-px bg-border" />}
          <p className="px-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
            {labels.addField}
          </p>
          <div className="flex flex-col">
            {remaining.map((f) => (
              <AddSortRow
                key={f.id}
                label={f.header}
                onClick={() =>
                  setSorting((prev) =>
                    prev.some((s) => s.id === f.id) ? prev : [...prev, { id: f.id, desc: false }],
                  )
                }
              />
            ))}
          </div>
        </>
      )}
      {labels.reset && active.length > 0 && (
        <>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => setSorting([])}
            className="flex w-full items-center rounded-sm px-1.5 py-1.5 text-sm hover:bg-accent"
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
            {labels.reset}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The column layout editor: one row per data column with a drag handle to
 * reorder and a checkbox to toggle visibility. `order` is the reconciled
 * display order (see `reconcileColumnOrder`).
 */
export function ColumnsPanel({
  fields,
  order,
  visibility,
  setColumnOrder,
  setColumnVisibility,
}: {
  fields: ColumnField[];
  order: string[];
  visibility: VisibilityState;
  setColumnOrder: Dispatch<SetStateAction<string[]>>;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
}) {
  const sensors = usePanelSensors();

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Move within the *reconciled* order, so ids missing from a stale stored
    // order (columns added since the layout was saved) stay addressable.
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setColumnOrder(arrayMove(order, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">
          {order.map((id) => {
            const field = fields.find((f) => f.id === id);
            if (!field) return null;
            return (
              <ColumnPropertyRow
                key={id}
                id={id}
                label={field.header}
                visible={visibility[id] !== false}
                canHide={field.canHide}
                onToggle={(visible) =>
                  setColumnVisibility((prev) => ({ ...prev, [id]: visible }))
                }
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/** Root-menu row that drills into a submenu (Filters / Sorting / Columns). */
export function MenuNavRow({
  icon: Icon,
  label,
  summary,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  summary?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-sm hover:bg-accent"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {summary && (
        <span className="max-w-[7rem] truncate text-xs text-muted-foreground">{summary}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** Back-navigation header shown at the top of a drilled-in submenu. */
export function SubmenuHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-0.5 flex w-full items-center gap-1.5 rounded-sm px-1 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/** An active sort field (priority row): drag handle to reprioritize, a
 *  direction toggle, and a remove button. */
function SortFieldRow({
  id,
  label,
  desc,
  ascendingLabel,
  descendingLabel,
  removeLabel,
  onToggleDirection,
  onRemove,
}: {
  id: string;
  label: string;
  desc: boolean;
  ascendingLabel: string;
  descendingLabel: string;
  removeLabel: string;
  onToggleDirection: () => void;
  onRemove: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1 rounded-sm py-0.5",
        isDragging && "z-10 bg-accent shadow-sm",
      )}
    >
      <button
        type="button"
        aria-label={label}
        className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <button
        type="button"
        onClick={onToggleDirection}
        aria-label={desc ? descendingLabel : ascendingLabel}
        className="flex h-6 items-center gap-1 rounded-sm border border-input px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {desc ? (
          <ArrowDown className="h-3 w-3" aria-hidden />
        ) : (
          <ArrowUp className="h-3 w-3" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** A remaining (not-yet-sorted) column offered under "Add sort field". */
function AddSortRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </button>
  );
}

/** One row of the columns panel: a drag handle to reorder plus a checkbox to
 *  toggle visibility. Reorder listens only on the handle so the checkbox and
 *  label stay clickable. */
function ColumnPropertyRow({
  id,
  label,
  visible,
  canHide,
  onToggle,
}: {
  id: string;
  label: string;
  visible: boolean;
  canHide: boolean;
  onToggle: (visible: boolean) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1 rounded-sm",
        isDragging && "z-10 bg-accent shadow-sm",
      )}
    >
      <button
        type="button"
        aria-label={label}
        className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <label
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 py-1 pr-1.5 text-sm",
          canHide ? "cursor-pointer" : "cursor-default",
        )}
      >
        <Checkbox
          checked={visible}
          disabled={!canHide}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="truncate">{label}</span>
      </label>
    </div>
  );
}
