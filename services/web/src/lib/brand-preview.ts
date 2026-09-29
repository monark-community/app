"use client";

import { useCallback, useEffect, useRef } from "react";
import { BRAND_THEME_VARS, brandThemeVars, type DarkColorMode } from "@/lib/brand-theme";

// Live preview of unsaved brand edits. The root layout paints the brand
// variables as an inline style on <html> (see `brandStyle` in layout.tsx) ;
// this hook overlays the edited values on the same element, computed by
// the same `brandThemeVars` the layout uses, so the whole app (the form
// included) re-themes as the admin types exactly as a save would. It puts
// the server's values back on cancel, on unmount, or once the edit matches
// the saved state again, and only acts when `orgId` is the org whose brand
// the layout applied (`data-brand-org`) : editing another org's color
// doesn't change what this deployment looks like.

const TINT_VAR = "--surface-tint";
const ALL_VARS = [...BRAND_THEME_VARS, TINT_VAR];

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A trimmed hex color, or null for blank / mid-typing input. */
export function validHex(value: string): string | null {
  const hex = value.trim();
  return HEX_RE.test(hex) ? hex : null;
}

export type BrandPreview = {
  /** Edited primary color ; blank or invalid previews the saved value. */
  primaryColor: string;
  /** Edited dark-mode behaviour. */
  primaryColorDarkMode: DarkColorMode;
  /** Edited dark-mode color, used in "custom" mode. */
  primaryColorDark: string;
  /** Edited tint ; null previews the deployment default. */
  surfaceTint: number | null;
};

export function useBrandPreview(orgId: string, edit: BrandPreview, dirty: boolean) {
  const snapshot = useRef<Record<string, string> | null>(null);

  const restore = useCallback(() => {
    const saved = snapshot.current;
    if (!saved) return;
    const style = document.documentElement.style;
    for (const name of ALL_VARS) {
      const value = saved[name];
      if (value) style.setProperty(name, value);
      else style.removeProperty(name);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.brandOrg !== orgId) return;
    if (!snapshot.current) {
      const captured: Record<string, string> = {};
      for (const name of ALL_VARS) captured[name] = root.style.getPropertyValue(name);
      snapshot.current = captured;
    }
    restore();
    if (!dirty) return;
    const primary = validHex(edit.primaryColor);
    if (primary) {
      // An org color replaces the deployment accent, as in the layout.
      const vars = brandThemeVars({
        primary,
        darkMode: edit.primaryColorDarkMode,
        primaryDark: validHex(edit.primaryColorDark),
        accent: null,
      });
      for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    }
    // Null previews the deployment default, which the layout exposes as
    // `data-brand-default-tint` (the inline style carries the org's value).
    const tint = edit.surfaceTint ?? root.dataset.brandDefaultTint;
    if (tint !== undefined) root.style.setProperty(TINT_VAR, String(tint));
  }, [
    orgId,
    edit.primaryColor,
    edit.primaryColorDarkMode,
    edit.primaryColorDark,
    edit.surfaceTint,
    dirty,
    restore,
  ]);

  // Leaving the page with unsaved edits drops the preview with them.
  useEffect(() => restore, [restore]);

  /** True when edits to `orgId` re-theme this deployment (so a save should reload). */
  const isBrandOrg = useCallback(
    () => typeof document !== "undefined" && document.documentElement.dataset.brandOrg === orgId,
    [orgId],
  );

  /** The deployment's `BRANDING_SURFACE_TINT`, the value an unset org tint falls back to. */
  const defaultTint = useCallback((): number => {
    if (typeof document === "undefined") return 1;
    const value = Number.parseFloat(document.documentElement.dataset.brandDefaultTint ?? "");
    return Number.isFinite(value) ? value : 1;
  }, []);

  return { restore, isBrandOrg, defaultTint };
}
