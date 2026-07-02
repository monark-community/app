"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Standard footer for a create/edit form: an optional destructive delete
 * action pinned to the far left, with the ghost cancel and primary submit
 * pushed to the right (submit rightmost). Order and alignment are fixed so
 * every form in the app reads the same way.
 *
 * The submit button is a real `type="submit"` — wire the form's `onSubmit`
 * on the surrounding `<form>`. `submitLabel` is passed already-resolved
 * (e.g. the caller swaps "Save" ⇄ "Saving…" from its mutation state).
 * Delete only renders when `onDelete` is provided ; the confirmation step
 * is the caller's (pair with {@link ConfirmDialog}).
 */
export function FormActionsFooter({
  submitLabel,
  cancelLabel,
  onCancel,
  isBusy = false,
  submitDisabled = false,
  onDelete,
  deleteLabel,
  className,
}: {
  submitLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  isBusy?: boolean;
  submitDisabled?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 pt-2", className)}>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={isBusy}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
          {deleteLabel}
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isBusy}>
          {cancelLabel}
        </Button>
        <Button type="submit" disabled={isBusy || submitDisabled}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
