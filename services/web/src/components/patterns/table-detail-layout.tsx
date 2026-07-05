"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { DragHandle } from "@monark/components/ui/drag-handle";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const MOBILE_MAX_WIDTH = 767;

/**
 * The current *screen* width in CSS px, read from `visualViewport.width` (the
 * actual visible viewport) rather than a media query / `innerWidth`, which
 * report the **layout viewport** (ICB).
 *
 * That distinction is load-bearing on iOS. If the layout viewport blows out
 * past the screen for even a moment — a transient during panel open, a wide
 * child painting before its `overflow` clips it — `innerWidth` / `matchMedia`
 * grow with it while `visualViewport.width` stays pinned to the real screen.
 * Both the mobile decision and the pinned panel width below read this, so
 * neither can be corrupted by a blow-out (and thus can't *lock one in* — see
 * {@link usePanelIsMobile}).
 */
function readScreenWidth(): number | null {
  if (typeof window === "undefined") return null;
  return Math.round(window.visualViewport?.width ?? window.innerWidth);
}

function useScreenWidth(): number | null {
  const [width, setWidth] = useState<number | null>(readScreenWidth);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setWidth(readScreenWidth());
    update();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return width;
}

/**
 * Mobile check, correct on the *first client render* (the panel is a
 * client-only portal, never in the SSR HTML, so reading the viewport in the
 * lazy initializer above can't cause a hydration mismatch). It matters because
 * a deep link (`?project=<id>`) opens the panel on the first render : a stale
 * value would pick the right-side `slide-in-from-right` variant, which paints
 * off-screen on a phone and blows the layout viewport out. Worse, a
 * media-query check would then *read that blown layout viewport* as "desktop",
 * lock the transform variant in, and never recover (the "pinch to see the
 * whole width" bug). Driving the decision off the visual-viewport width breaks
 * the feedback loop : the panel stays on the transform-free `full` variant.
 *
 * `null` (SSR / no window yet) reads as desktop — the panel isn't painted on
 * the server anyway, and the first client value resolves synchronously.
 */
function usePanelIsMobile(width: number | null): boolean {
  return width != null && width <= MOBILE_MAX_WIDTH;
}

// The detail-panel width is persisted per screen (localStorage, desktop
// only) : the base key below is suffixed with the caller's `storageKey`, so
// e.g. the projects and industries panels remember independent widths. A
// caller that omits `storageKey` falls back to the bare base key (one shared
// preference), preserving the previous behaviour.
const WIDTH_STORAGE_KEY = "detail-panel-width";
const MIN_PANEL_WIDTH = 380;

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
 * - The left edge is a **drag handle** : the panel is resizable and the
 *   chosen width persists per screen (keyed by `storageKey`).
 *   `panelClassName` sets the default width until the operator drags.
 *
 * On **mobile** the same sheet goes *full-screen and modal* (with an
 * overlay) — a side panel is unusable in a narrow viewport, so selecting a
 * row takes over the whole screen. The panel's own header collapse button
 * is the way back ; resizing is disabled.
 *
 * Pair with {@link useDetailPanelRoute} for `open` / `onClose`, put the
 * row-selection highlight in the table, and compose the panel body from
 * {@link PanelHeader} + your form.
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
  storageKey,
}: {
  open: boolean;
  onClose: () => void;
  table: ReactNode;
  panel: ReactNode;
  tableClassName?: string;
  panelClassName?: string;
  /** Namespaces the persisted panel width so each screen (project vs industry
   *  vs an admin surface) remembers its own. Omit for the shared default. */
  storageKey?: string;
}) {
  const tableRef = useRef<HTMLDivElement>(null);
  const screenWidth = useScreenWidth();
  const isMobile = usePanelIsMobile(screenWidth);

  const widthKey = storageKey ? `${WIDTH_STORAGE_KEY}:${storageKey}` : WIDTH_STORAGE_KEY;

  // Explicit resized width (px). `null` = never resized → fall back to the
  // class-based default from `panelClassName`.
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const draggingRef = useRef(false);
  // Mirror of `draggingRef` purely so the resize grip stays revealed while a
  // drag is in progress (the ref drives the move logic without re-rendering).
  const [dragging, setDragging] = useState(false);
  const lastWidthRef = useRef<number | null>(null);

  // Load this screen's saved width (and reset when the key changes, e.g. a
  // client nav between two list screens reuses the component).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(widthKey);
      const n = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
      if (Number.isFinite(n)) {
        const w = clampWidth(n);
        setPanelWidth(w);
        lastWidthRef.current = w;
        return;
      }
    } catch {
      // ignore unavailable / corrupt storage
    }
    setPanelWidth(null);
    lastWidthRef.current = null;
  }, [widthKey]);

  function clampWidth(w: number): number {
    const max = Math.max(MIN_PANEL_WIDTH, Math.round(window.innerWidth * 0.6));
    return Math.min(Math.max(w, MIN_PANEL_WIDTH), max);
  }

  function onResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }
  function onResizeMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    // The panel is anchored to the right edge, so its width is the distance
    // from the pointer to the right side of the viewport.
    const next = clampWidth(window.innerWidth - e.clientX);
    lastWidthRef.current = next;
    setPanelWidth(next);
  }
  function onResizeEnd(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    try {
      if (lastWidthRef.current != null) {
        window.localStorage.setItem(widthKey, String(lastWidthRef.current));
      }
    } catch {
      // ignore
    }
  }

  const resized = !isMobile && panelWidth != null;

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
          // Mobile : cap the full-bleed panel at the *visual* screen width so
          // the panel (and its form's `@container`) can never be wider than the
          // phone screen, even if the layout viewport momentarily blows out —
          // `w-full` resolves against the ICB, this `maxWidth` clamps it back.
          // Desktop : an explicit resized width overrides the class default
          // (`maxWidth: none` lifts `panelClassName`'s `sm:max-w-*` cap).
          style={
            isMobile
              ? screenWidth != null
                ? { maxWidth: screenWidth }
                : undefined
              : resized
                ? { width: panelWidth ?? undefined, maxWidth: "none" }
                : undefined
          }
          onInteractOutside={(e) => {
            // Keep the panel open when the pointer lands inside the table
            // (clicking another row switches selection), inside a portaled
            // overlay surface it spawned (a `…` menu, column menu, select,
            // or confirm dialog — all rendered outside the table DOM), on a
            // toast (dismissing a toast must not close the panel), or when the
            // event is focus-only (tabbing). Any other outside pointer-down
            // closes ; Escape closes via Radix's default.
            const original = e.detail.originalEvent;
            const target = original.target as Node | null;
            const el = target instanceof Element ? target : null;
            const isPointer = original.type === "pointerdown";
            const insideTable = !!(target && tableRef.current?.contains(target));
            const insideOverlay = !!el?.closest(
              '[data-radix-popper-content-wrapper],[role="menu"],[role="listbox"],[role="dialog"],[data-sonner-toaster]',
            );
            if (!isPointer || insideTable || insideOverlay) e.preventDefault();
          }}
        >
          {!isMobile && (
            // Left-edge resize grip (pointer-only, like the DataTable column
            // handle). The chip reveals on hover and stays while dragging.
            <DragHandle
              orientation="vertical"
              active={dragging}
              highlight
              onPointerDown={onResizeStart}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
              className="absolute left-0 top-0 z-20 h-full w-1.5"
            />
          )}
          {panel}
        </SheetContent>
      </Sheet>
    </>
  );
}
