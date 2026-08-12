"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Block } from "@blocknote/core";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BlockEditor } from "@/components/fields/inputs/block-editor";
import {
  ConfirmDialog,
  MultiSelect,
  PanelHeader,
  type MultiSelectOption,
} from "@/components/patterns";
import { DangerCard, DangerRow } from "@/components/danger-card";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { DragHandle } from "@monark/components/ui/drag-handle";
import { usePanelIsMobile, useScreenWidth } from "@/hooks/use-panel-is-mobile";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { cn } from "@/lib/utils";
import {
  KANBAN_PRIORITIES,
  KANBAN_PRIORITY_COLOR,
  type KanbanCardPriority,
} from "@monark/kanban/client";
import { trpc } from "@/lib/trpc";

export type EditableCard = {
  id: string;
  title: string;
  columnId: string;
  /** Block-array card body (JSON) ; coerced to `Block[]` by the editor. Optional:
   *  an `unknown` field serializes as optional through tRPC. The card's checklist
   *  now lives in this body (BlockNote check-list blocks), not a separate field. */
  description?: unknown;
  assigneeIds: string[];
  reviewerIds: string[];
  dueAt: Date | string | null;
  priority: KanbanCardPriority | null;
  estimate: number | null;
};

type Member = { id: string; displayName: string | null; email: string; avatarUrl?: string | null };
/** Board columns, for the status selector (a status is a column). */
type StatusColumn = { id: string; name: string; color: string | null };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** Small member avatar shown in the assignee picker (chip + dropdown row). */
function MemberAvatar({ member }: { member: Member }) {
  const name = member.displayName ?? member.email;
  return (
    <Avatar className="h-5 w-5">
      {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" />}
      <AvatarFallback className="text-[9px] font-semibold text-muted-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

type State = { mode: "create"; columnId: string } | { mode: "edit"; card: EditableCard };

// Radix Select disallows an empty item value, so the "none" priority uses a sentinel.
const NO_PRIORITY = "__none__";

/** Convert a stored date to the `YYYY-MM-DD` the card holds internally. */
function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → a local Date at midnight (so the calendar highlights the same
 *  day the string names, regardless of timezone). */
function ymdToLocalDate(ymd: string): Date | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** A local Date → `YYYY-MM-DD` (using the local calendar day, not UTC). */
function localDateToYmd(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

type CardEditorProps = {
  boardId: string;
  state: State;
  members: Member[];
  columns: StatusColumn[];
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * The persistent panel shell. The `Sheet` stays mounted while the panel is open,
 * so selecting one card after another only remounts the inner {@link CardForm}
 * (via `formKey`) to re-seed the fields — the Sheet's open animation (and its
 * layout shift) never replays on a card-to-card switch.
 */
export function CardEditor(props: CardEditorProps) {
  const { state, onClose } = props;
  const t = useTranslations("kanban");
  // Desktop : a non-modal right-side panel (the board stays visible behind it).
  // Mobile : a full-screen, transform-free `full` sheet (see use-panel-is-mobile).
  const screenWidth = useScreenWidth();
  const isMobile = usePanelIsMobile(screenWidth);
  // Left-edge resize on desktop, persisted per screen (shared with the data
  // record panel — `TableDetailLayout` uses the same hook behaviour).
  const resize = useResizablePanel({ storageKey: "kanban-card", enabled: !isMobile });
  const isEdit = state.mode === "edit";
  const title = isEdit ? t("card.editTitle") : t("card.createTitle");
  const formKey = state.mode === "edit" ? state.card.id : `create-${state.columnId}`;

  return (
    <Sheet open modal={isMobile} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        // Desktop : slide-in right panel, non-modal + no overlay so the board
        // stays visible/interactive behind it. Mobile : the transform-free
        // `full` variant takes over the screen (see use-panel-is-mobile for why
        // a slide variant blows out the iOS viewport).
        side={isMobile ? "full" : "right"}
        overlay={isMobile}
        hideClose
        aria-describedby={undefined}
        className={cn("flex flex-col gap-0 overflow-hidden p-0", !isMobile && "w-full sm:max-w-lg")}
        // Mobile : clamp the full-bleed panel to the real screen width. Desktop :
        // an explicit resized width overrides the class default (`maxWidth: none`
        // lifts the `sm:max-w-lg` cap).
        style={
          isMobile ? (screenWidth != null ? { maxWidth: screenWidth } : undefined) : resize.style
        }
        // Desktop : keep the panel open on any outside interaction (clicking the
        // board, a portaled select/menu, or the delete confirm) — close is via
        // the header X, Cancel, or Escape, so a stray click can't drop the form.
        onInteractOutside={isMobile ? undefined : (e) => e.preventDefault()}
      >
        {!isMobile && (
          // Left-edge resize grip (pointer-only), matching the data record panel.
          <DragHandle
            orientation="vertical"
            active={resize.dragging}
            highlight
            {...resize.handleProps}
            className="absolute left-0 top-0 z-20 h-full w-1.5"
          />
        )}
        {/* Accessible dialog name (visually the PanelHeader title below). */}
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <PanelHeader title={title} onClose={onClose} />
        <CardForm key={formKey} {...props} />
      </SheetContent>
    </Sheet>
  );
}

function asBlocks(value: unknown): Block[] {
  return Array.isArray(value) ? (value as Block[]) : [];
}

/** The card form itself — remounted per card by `CardEditor` so its field state
 *  re-seeds without re-animating the surrounding panel. */
function CardForm({ boardId, state, members, columns, canDelete, onSaved }: CardEditorProps) {
  const t = useTranslations("kanban");
  const tCommon = useTranslations("common");
  const isEdit = state.mode === "edit";

  // The loaded baseline the form seeds from (the card's values, or the empty
  // create defaults). `CardForm` remounts per card (via `key`), so this is
  // stable for the lifetime of one edit — it drives both the initial field
  // state and the dirty check / revert below.
  const initial = useMemo(
    () =>
      state.mode === "edit"
        ? {
            status: state.card.columnId,
            title: state.card.title,
            description: asBlocks(state.card.description),
            assignees: state.card.assigneeIds,
            reviewers: state.card.reviewerIds,
            priority: (state.card.priority ?? NO_PRIORITY) as string,
            estimate: state.card.estimate != null ? String(state.card.estimate) : "",
            due: toDateInput(state.card.dueAt),
          }
        : {
            status: state.columnId,
            title: "",
            description: [] as Block[],
            assignees: [] as string[],
            reviewers: [] as string[],
            priority: NO_PRIORITY as string,
            estimate: "",
            due: "",
          },
    [state],
  );

  const [status, setStatus] = useState(initial.status);
  const [title, setTitle] = useState(initial.title);
  // The description block editor is UNCONTROLLED : edits stream into a ref so
  // typing never re-renders the form (which on mobile would abort IME
  // composition and swallow Enter). Its dirtiness is a one-shot flag flipped on
  // the first edit, so there's exactly one re-render, not one per keystroke.
  const descriptionRef = useRef<Block[]>(initial.description);
  const descriptionDirtyRef = useRef(false);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  // Bumped on Cancel/revert to remount the (uncontrolled) editor so it re-seeds
  // from the baseline ; typing never touches this, so it never re-renders mid-edit.
  const [editorKey, setEditorKey] = useState(0);
  const onBodyChange = useCallback((blocks: Block[]) => {
    descriptionRef.current = blocks;
    if (!descriptionDirtyRef.current) {
      descriptionDirtyRef.current = true;
      setDescriptionDirty(true);
    }
  }, []);
  const [assignees, setAssignees] = useState<string[]>(initial.assignees);
  const [reviewers, setReviewers] = useState<string[]>(initial.reviewers);
  const [priority, setPriority] = useState<string>(initial.priority);
  const [estimate, setEstimate] = useState(initial.estimate);
  const [due, setDue] = useState(initial.due);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Dirty vs the loaded baseline, for the `DirtyFormBar` gate (JSON compare is
  // enough — the fields are all plain values / small arrays). Description is
  // excluded from the diff (it lives in a ref) ; `descriptionDirty` covers it.
  const initialJson = useMemo(() => {
    const { description: _description, ...rest } = initial;
    return JSON.stringify(rest);
  }, [initial]);
  const dirty =
    descriptionDirty ||
    JSON.stringify({ status, title, assignees, reviewers, priority, estimate, due }) !==
      initialJson;

  // Cancel = revert to baseline (the panel's X / Escape is how you leave).
  function reset() {
    setStatus(initial.status);
    setTitle(initial.title);
    descriptionRef.current = initial.description;
    descriptionDirtyRef.current = false;
    setDescriptionDirty(false);
    setEditorKey((k) => k + 1);
    setAssignees(initial.assignees);
    setReviewers(initial.reviewers);
    setPriority(initial.priority);
    setEstimate(initial.estimate);
    setDue(initial.due);
  }

  const createMutation = trpc.kanban.cards.create.useMutation({
    onSuccess: () => {
      toast.success(t("card.createdToast"));
      onSaved();
    },
    onError: (err) => toast.error(t("card.errorToast", { message: err.message })),
  });
  const updateMutation = trpc.kanban.cards.update.useMutation({
    onSuccess: () => {
      toast.success(t("card.savedToast"));
      onSaved();
    },
    onError: (err) => toast.error(t("card.errorToast", { message: err.message })),
  });
  const deleteMutation = trpc.kanban.cards.delete.useMutation({
    onSuccess: () => {
      toast.success(t("card.deletedToast"));
      onSaved();
    },
    onError: (err) => toast.error(t("card.errorToast", { message: err.message })),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const memberOptions: MultiSelectOption[] = members.map((m) => ({
    value: m.id,
    label: m.displayName ?? m.email,
    searchText: `${m.displayName ?? ""} ${m.email}`.trim(),
    leading: <MemberAvatar member={m} />,
  }));

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error(t("card.titleRequired"));
      return;
    }
    const trimmedEstimate = estimate.trim();
    let estimateValue: number | null = null;
    if (trimmedEstimate !== "") {
      const n = Number.parseInt(trimmedEstimate, 10);
      if (!Number.isFinite(n) || n < 0 || n > 9999) {
        toast.error(t("card.estimateInvalid"));
        return;
      }
      estimateValue = n;
    }
    const payload = {
      title: trimmed,
      columnId: status,
      description: descriptionRef.current,
      assigneeIds: assignees,
      reviewerIds: reviewers,
      priority: priority === NO_PRIORITY ? null : (priority as KanbanCardPriority),
      estimate: estimateValue,
      dueAt: due ? due : null,
    };
    if (state.mode === "create") {
      createMutation.mutate({ boardId, ...payload });
    } else {
      updateMutation.mutate({ id: state.card.id, ...payload });
    }
  }

  return (
    <>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* pb-24 clears the floating DirtyFormBar when it slides in. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-24 pt-5">
          <div className="space-y-1.5">
            <Label htmlFor="card-title">{t("card.titleLabel")}</Label>
            <Input
              id="card-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </div>
          {/* Metadata rows first ; the description body (with its checklist)
                below them. Status + estimate on one row, priority + due beneath. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="card-status">{t("card.statusLabel")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="card-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: c.color ?? "hsl(var(--muted-foreground))",
                          }}
                          aria-hidden
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-estimate">{t("card.estimateLabel")}</Label>
              <Input
                id="card-estimate"
                type="number"
                min={0}
                max={9999}
                inputMode="numeric"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder={t("card.estimatePlaceholder")}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="card-priority">{t("card.priorityLabel")}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="card-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PRIORITY}>{t("card.priorityNone")}</SelectItem>
                  {KANBAN_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                        style={{
                          color: KANBAN_PRIORITY_COLOR[p],
                          backgroundColor: `${KANBAN_PRIORITY_COLOR[p]}26`,
                        }}
                      >
                        {t(`card.priority.${p}`)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-due">{t("card.dueLabel")}</Label>
              <DatePicker
                id="card-due"
                value={ymdToLocalDate(due)}
                onChange={(date) => setDue(date ? localDateToYmd(date) : "")}
                placeholder={t("card.duePlaceholder")}
                clearLabel={t("card.dueClear")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-assignees">{t("card.assigneesLabel")}</Label>
            <MultiSelect
              id="card-assignees"
              value={assignees}
              onChange={setAssignees}
              options={memberOptions}
              max={20}
              labels={{
                placeholder: t("card.assigneePlaceholder"),
                add: t("card.assigneeAdd"),
                remove: (name) => t("card.assigneeRemove", { name }),
                noResults: t("card.assigneeNoResults"),
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-reviewers">{t("card.reviewersLabel")}</Label>
            <MultiSelect
              id="card-reviewers"
              value={reviewers}
              onChange={setReviewers}
              options={memberOptions}
              max={20}
              labels={{
                placeholder: t("card.reviewerPlaceholder"),
                add: t("card.reviewerAdd"),
                remove: (name) => t("card.reviewerRemove", { name }),
                noResults: t("card.assigneeNoResults"),
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("card.descriptionLabel")}</Label>
            <div className="rounded-md border">
              <BlockEditor
                key={editorKey}
                value={initial.description}
                onChange={onBodyChange}
                minHeight={140}
                ariaLabel={t("card.descriptionLabel")}
              />
            </div>
          </div>
          {isEdit && canDelete && (
            <DangerCard title={t("card.dangerTitle")}>
              <DangerRow
                title={t("card.delete")}
                description={t("card.deleteRowDescription")}
                action={
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t("card.delete")}
                  </Button>
                }
              />
            </DangerCard>
          )}
        </div>
      </form>

      {/* The blessed save affordance : a dirty-gated bar anchored to the panel
          bottom. Cancel reverts to the loaded card (leave via the header X). */}
      <DirtyFormBar
        containment="container"
        open={dirty}
        onSave={submit}
        onCancel={reset}
        saving={isBusy}
        saveLabel={isEdit ? t("card.save") : t("card.create")}
        savingLabel={isEdit ? t("card.saving") : t("card.creating")}
        cancelLabel={t("card.cancel")}
        message={tCommon("unsavedChanges")}
      />

      {isEdit && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("card.deleteConfirmTitle")}
          description={t("card.deleteConfirmBody")}
          cancelLabel={t("card.cancel")}
          confirmLabel={t("card.delete")}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate({ id: state.card.id })}
        />
      )}
    </>
  );
}
