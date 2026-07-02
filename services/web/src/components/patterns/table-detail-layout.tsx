"use client";

import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * The table ↔ detail-panel combo used by the admin list screens. Renders
 * the table inside a bordered container and a detail `Sheet`.
 *
 * On **desktop** the sheet is a *persistent, non-modal* right-hand panel:
 *
 * - `modal={false}` + `overlay={false}` keep the table interactive behind
 *   the open panel, so clicking another row switches the selection.
 * - Escape closes it (Radix default). A pointer-down outside the panel
 *   closes it too — *unless* it lands inside the table (row switching) or
 *   is focus-only (tabbing), which are ignored.
 *
 * On **mobile** the same sheet goes *full-screen and modal* (with an
 * overlay) — a side panel is unusable in a narrow viewport, so selecting a
 * row takes over the whole screen. The panel's own header collapse button
 * is the way back.
 *
 * Pair with {@link useDetailPanelRoute} for `open` / `onClose`, put the
 * row-selection highlight in the table, and compose the panel body from
 * {@link PanelHeaderBar} + your form.
 *
 * `table` is placed where this component renders (so it flows with the
 * surrounding toolbar) ; the `Sheet` is portaled out of the DOM flow.
 */
export function TableDetailLayout({
  open,
  onClose,
  table,
  panel,
  tableClassName,
  panelClassName,
}: {
  open: boolean;
  onClose: () => void;
  table: ReactNode;
  panel: ReactNode;
  tableClassName?: string;
  panelClassName?: string;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  return (
    <>
      <div ref={tableRef} className={cn("rounded-lg border border-border", tableClassName)}>
        {table}
      </div>

      <Sheet
        open={open}
        modal={isMobile}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent
          // On mobile the panel takes over the screen via the dedicated
          // `full` variant (full-bleed, fade-only — see sheet.tsx) rather
          // than the right-side slide, which would paint off-screen and blow
          // out the mobile viewport. `overflow-hidden` clips any wide child
          // to the panel so nothing can leak past the screen edge ; the panel
          // body owns its own vertical scroll.
          side={isMobile ? "full" : "right"}
          overlay={isMobile}
          hideClose
          className={cn(
            // The panel is `position: fixed` (from the Sheet variant), which
            // already establishes a containing block — so a `DirtyFormBar
            // containment="container"` rendered inside anchors to the panel
            // bottom. Do NOT add `relative` here : tailwind-merge would treat
            // it as a conflicting position utility and drop `fixed`, dropping
            // the panel out of its overlay into normal flow (mobile shows only
            // the backdrop).
            "flex flex-col overflow-hidden p-0",
            isMobile ? undefined : panelClassName,
          )}
          onInteractOutside={(e) => {
            // Keep the panel open when the pointer lands inside the table
            // (clicking another row switches selection), inside a portaled
            // overlay surface it spawned (a `…` menu, column menu, select,
            // or confirm dialog — all rendered outside the table DOM), or
            // when the event is focus-only (tabbing). Any other outside
            // pointer-down closes ; Escape closes via Radix's default.
            const original = e.detail.originalEvent;
            const target = original.target as Node | null;
            const el = target instanceof Element ? target : null;
            const isPointer = original.type === "pointerdown";
            const insideTable = !!(target && tableRef.current?.contains(target));
            const insideOverlay = !!el?.closest(
              '[data-radix-popper-content-wrapper],[role="menu"],[role="listbox"],[role="dialog"]',
            );
            if (!isPointer || insideTable || insideOverlay) e.preventDefault();
          }}
        >
          {panel}
        </SheetContent>
      </Sheet>
    </>
  );
}
