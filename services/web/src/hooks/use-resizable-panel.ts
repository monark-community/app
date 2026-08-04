"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

// A resized detail-panel width is persisted per screen (localStorage, desktop
// only), keyed by `storageKey` under this base — so different panels remember
// independent widths. Mirrors the constants `TableDetailLayout` uses so the
// kanban card panel and the data record panel resize identically.
const WIDTH_STORAGE_KEY = "detail-panel-width";
const MIN_PANEL_WIDTH = 380;

function clampWidth(w: number): number {
  const max = Math.max(MIN_PANEL_WIDTH, Math.round(window.innerWidth * 0.6));
  return Math.min(Math.max(w, MIN_PANEL_WIDTH), max);
}

export type ResizablePanel = {
  /** True while a resize drag is in progress (keeps the grip revealed). */
  dragging: boolean;
  /** Style to spread onto a right-anchored panel : an explicit width that
   *  overrides the class default, or `undefined` when never resized. */
  style: { width: number; maxWidth: "none" } | undefined;
  /** Pointer handlers for the left-edge drag grip. */
  handleProps: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
  };
};

/**
 * Left-edge resize for a right-anchored side panel (the shared behaviour behind
 * `TableDetailLayout` and the kanban card panel). The chosen width persists per
 * screen under `storageKey`. Pass `enabled: false` (mobile / full-screen) to
 * make it inert — the panel falls back to its class-based width.
 */
export function useResizablePanel({
  storageKey,
  enabled,
}: {
  storageKey: string;
  enabled: boolean;
}): ResizablePanel {
  const widthKey = `${WIDTH_STORAGE_KEY}:${storageKey}`;
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const lastWidthRef = useRef<number | null>(null);

  // Load this screen's saved width (reset when the key changes).
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

  const onPointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return;
    // Right-anchored : width = distance from the pointer to the viewport's edge.
    const next = clampWidth(window.innerWidth - e.clientX);
    lastWidthRef.current = next;
    setPanelWidth(next);
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
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
    },
    [widthKey],
  );

  const resized = enabled && panelWidth != null;
  return {
    dragging,
    style: resized && panelWidth != null ? { width: panelWidth, maxWidth: "none" } : undefined,
    handleProps: { onPointerDown, onPointerMove, onPointerUp },
  };
}
