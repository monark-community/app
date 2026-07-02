"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Fixed-to-bottom Save / Cancel banner that appears when an editor
 * page has unsaved changes. Discoverable across the app : the same
 * affordance shape lands on every explicit-save form (webhook editor,
 * role editor, org detail), so the operator builds a single "the bar
 * is at the bottom when there's something to save" expectation rather
 * than hunting for an in-form footer.
 *
 * The bar is hidden via a `translate-y-full` slide-out so a quick
 * type-then-erase doesn't flicker it on. `pointer-events-none` on the
 * outer wrapper while hidden keeps the banner from intercepting
 * clicks on whatever sits underneath.
 *
 * Cancel semantics here are "revert" (reset the form to the loaded
 * baseline), not "navigate away" — the operator wouldn't open this
 * banner if they wanted to leave. Pages that want a navigate-away
 * affordance render it elsewhere (e.g. the back button on the page
 * header).
 *
 * `containment` picks the anchor. `"viewport"` (default) pins the bar to
 * the bottom of the screen via `position: fixed` — the full-page editor
 * case. `"container"` uses `position: absolute` so the bar anchors to the
 * nearest positioned ancestor instead ; render it inside a detail panel
 * (whose `SheetContent` is `relative`) and it floats at the bottom of the
 * *panel*, not the whole screen. Both share the dirty-gated slide so the
 * affordance reads identically wherever it lands.
 */
export function DirtyFormBar({
  open,
  onSave,
  onCancel,
  saving = false,
  saveLabel,
  savingLabel,
  cancelLabel,
  message,
  containment = "viewport",
}: {
  open: boolean;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  saveLabel: string;
  /** Optional in-progress label (e.g. "Saving…"). Falls back to `saveLabel` while saving. */
  savingLabel?: string;
  cancelLabel: string;
  /** Left-aligned status copy (typically "Unsaved changes"). */
  message?: string;
  /** `"viewport"` = fixed to the screen (full-page). `"container"` =
   *  absolute to the nearest positioned ancestor (inside a detail panel). */
  containment?: "viewport" | "container";
}) {
  return (
    <div
      className={cn(
        "pointer-events-none z-40 flex justify-center transition-transform duration-200",
        containment === "viewport"
          ? "fixed inset-x-0 bottom-0 px-4 pb-4 sm:px-6 sm:pb-6"
          : "absolute inset-x-0 bottom-0 p-3",
        open ? "translate-y-0" : "translate-y-full",
      )}
      aria-hidden={!open}
    >
      <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
        {message && <p className="flex-1 truncate text-sm text-muted-foreground">{message}</p>}
        <div className={cn("flex items-center gap-2", !message && "ml-auto")}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? (savingLabel ?? saveLabel) : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
