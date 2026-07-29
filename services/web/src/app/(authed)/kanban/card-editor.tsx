"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RichTextEditor, useFieldStrings } from "@/components/fields";
import {
  ConfirmDialog,
  MultiSelect,
  PanelHeader,
  type MultiSelectOption,
} from "@/components/patterns";
import { DangerCard, DangerRow } from "@/components/danger-card";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import { usePanelIsMobile, useScreenWidth } from "@/hooks/use-panel-is-mobile";
import { cn } from "@/lib/utils";
import {
  KANBAN_PRIORITIES,
  KANBAN_PRIORITY_COLOR,
  KANBAN_SUBTASK_MAX,
  parseSubtasks,
  type KanbanCardPriority,
  type KanbanSubtask,
} from "@monark/kanban/client";
import { trpc } from "@/lib/trpc";

export type EditableCard = {
  id: string;
  title: string;
  columnId: string;
  description: string | null;
  assigneeIds: string[];
  reviewerIds: string[];
  dueAt: Date | string | null;
  priority: KanbanCardPriority | null;
  estimate: number | null;
  // Opaque JSON from the API (a `KanbanSubtask[]`) ; parsed with `parseSubtasks`
  // when the form seeds its state (retyping through the pass-through card would
  // spread the large tRPC card type and blow tsc's instantiation-depth limit).
  subtasks?: unknown;
};

/** Client id for a new subtask row — Math.random (never crypto.randomUUID,
 *  which throws on LAN-http mobile dev). */
function newSubtaskId(): string {
  return `st_${Math.random().toString(36).slice(2, 10)}`;
}

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
        // Mobile : clamp the full-bleed panel to the real screen width so it
        // can't exceed the phone even if the layout viewport blows out.
        style={isMobile && screenWidth != null ? { maxWidth: screenWidth } : undefined}
        // Desktop : keep the panel open on any outside interaction (clicking the
        // board, a portaled select/menu, or the delete confirm) — close is via
        // the header X, Cancel, or Escape, so a stray click can't drop the form.
        onInteractOutside={isMobile ? undefined : (e) => e.preventDefault()}
      >
        {/* Accessible dialog name (visually the PanelHeader title below). */}
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <PanelHeader title={title} onClose={onClose} />
        <CardForm key={formKey} {...props} />
      </SheetContent>
    </Sheet>
  );
}

/** The card form itself — remounted per card by `CardEditor` so its field state
 *  re-seeds without re-animating the surrounding panel. */
function CardForm({ boardId, state, members, columns, canDelete, onSaved }: CardEditorProps) {
  const t = useTranslations("kanban");
  const tCommon = useTranslations("common");
  const { labels: fieldLabels } = useFieldStrings();
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
            description: state.card.description ?? "",
            assignees: state.card.assigneeIds,
            reviewers: state.card.reviewerIds,
            priority: (state.card.priority ?? NO_PRIORITY) as string,
            estimate: state.card.estimate != null ? String(state.card.estimate) : "",
            due: toDateInput(state.card.dueAt),
            subtasks: parseSubtasks(state.card.subtasks),
          }
        : {
            status: state.columnId,
            title: "",
            description: "",
            assignees: [] as string[],
            reviewers: [] as string[],
            priority: NO_PRIORITY as string,
            estimate: "",
            due: "",
            subtasks: [] as KanbanSubtask[],
          },
    [state],
  );

  const [status, setStatus] = useState(initial.status);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [assignees, setAssignees] = useState<string[]>(initial.assignees);
  const [reviewers, setReviewers] = useState<string[]>(initial.reviewers);
  const [priority, setPriority] = useState<string>(initial.priority);
  const [estimate, setEstimate] = useState(initial.estimate);
  const [due, setDue] = useState(initial.due);
  const [subtasks, setSubtasks] = useState<KanbanSubtask[]>(initial.subtasks);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Dirty vs the loaded baseline, for the `DirtyFormBar` gate (JSON compare is
  // enough — the fields are all plain values / small arrays).
  const initialJson = useMemo(() => JSON.stringify(initial), [initial]);
  const dirty =
    JSON.stringify({
      status,
      title,
      description,
      assignees,
      reviewers,
      priority,
      estimate,
      due,
      subtasks,
    }) !== initialJson;

  // Cancel = revert to baseline (the panel's X / Escape is how you leave).
  function reset() {
    setStatus(initial.status);
    setTitle(initial.title);
    setDescription(initial.description);
    setAssignees(initial.assignees);
    setReviewers(initial.reviewers);
    setPriority(initial.priority);
    setEstimate(initial.estimate);
    setDue(initial.due);
    setSubtasks(initial.subtasks);
  }

  const doneCount = subtasks.filter((s) => s.done).length;
  function addSubtask() {
    setSubtasks((prev) =>
      prev.length >= KANBAN_SUBTASK_MAX
        ? prev
        : [...prev, { id: newSubtaskId(), title: "", done: false }],
    );
  }
  function patchSubtask(id: string, patch: Partial<KanbanSubtask>) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
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
      description: description.trim().length > 0 ? description : null,
      assigneeIds: assignees,
      reviewerIds: reviewers,
      priority: priority === NO_PRIORITY ? null : (priority as KanbanCardPriority),
      estimate: estimateValue,
      dueAt: due ? due : null,
      // Drop blank rows, then send as a JSON string (the tRPC input takes a
      // string to keep its inferred type flat — see the server's parseSubtasksInput).
      subtasks: JSON.stringify(
        subtasks.map((s) => ({ ...s, title: s.title.trim() })).filter((s) => s.title.length > 0),
      ),
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
          {/* Metadata rows first ; description + subtasks below them. Status +
                estimate on one row, priority + due date beneath it. */}
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
            <Label htmlFor="card-description">{t("card.descriptionLabel")}</Label>
            <RichTextEditor
              id="card-description"
              value={description}
              onChange={setDescription}
              labels={fieldLabels.richText}
              ariaLabel={t("card.descriptionLabel")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("card.subtasksLabel")}
              {subtasks.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                  {doneCount}/{subtasks.length}
                </span>
              )}
            </Label>
            <div className="space-y-1.5">
              {subtasks.map((st) => (
                <div key={st.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={st.done}
                    onChange={(e) => patchSubtask(st.id, { done: e.target.checked })}
                    aria-label={t("card.subtaskDone")}
                  />
                  <Input
                    value={st.title}
                    onChange={(e) => patchSubtask(st.id, { title: e.target.value })}
                    placeholder={t("card.subtaskPlaceholder")}
                    maxLength={200}
                    className={cn("h-9", st.done && "text-muted-foreground line-through")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => removeSubtask(st.id)}
                    aria-label={t("card.subtaskRemove")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={addSubtask}
                disabled={subtasks.length >= KANBAN_SUBTASK_MAX}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                {t("card.subtaskAdd")}
              </Button>
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
