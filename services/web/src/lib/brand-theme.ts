import { adaptBrandColor, pickContrastForeground } from "@monark/common/color";

// The brand CSS variables for both themes, computed once from the brand
// inputs. Shared by the root layout (server, from the saved org / env
// values) and the organization page's live preview (client, from the
// edited values), so a preview is exactly what a save will produce.
//
// globals.css maps them onto the active theme : `--primary` reads
// `--brand-light` under :root and `--brand-dark` under .dark, and every
// other brand-colored token (ring, sidebar, chart-1, badge, gradients)
// follows `--primary`.

/**
 * How dark mode derives the brand color :
 *   - "same"     : `primary` as is, even if it lacks contrast there ;
 *   - "adaptive" : `primary`, adapted only when it lacks contrast (default) ;
 *   - "custom"   : `primaryDark`, an exact color the org chose.
 */
export type DarkColorMode = "same" | "adaptive" | "custom";

export type BrandInputs = {
  /** The brand color : the org's `primaryColor`, else `BRANDING_PRIMARY`. */
  primary: string;
  darkMode: DarkColorMode;
  /** The org's dark-mode color, used when `darkMode` is "custom". */
  primaryDark: string | null;
  /**
   * A deployment accent paired with `BRANDING_PRIMARY` ; null when the
   * org set its own primary, which then stands in as the accent too.
   */
  accent: string | null;
};

export type BrandThemeColors = {
  light: string;
  dark: string;
};

/** The brand color each theme actually uses (adapted unless overridden). */
export function brandThemeColors({
  primary,
  darkMode,
  primaryDark,
}: BrandInputs): BrandThemeColors {
  const dark =
    darkMode === "custom" && primaryDark
      ? primaryDark
      : darkMode === "same"
        ? primary
        : adaptBrandColor(primary, "dark");
  return { light: adaptBrandColor(primary, "light"), dark };
}

export const BRAND_THEME_VARS = [
  "--brand-light",
  "--brand-light-foreground",
  "--brand-dark",
  "--brand-dark-foreground",
  "--brand-accent-light",
  "--brand-accent-dark",
] as const;

export function brandThemeVars(
  inputs: BrandInputs,
): Record<(typeof BRAND_THEME_VARS)[number], string> {
  const { light, dark } = brandThemeColors(inputs);
  return {
    "--brand-light": light,
    // Contrast-correct text on the brand (black or white by WCAG luminance),
    // per theme : a black brand lifted to grey for dark mode needs its own.
    "--brand-light-foreground": pickContrastForeground(light),
    "--brand-dark": dark,
    "--brand-dark-foreground": pickContrastForeground(dark),
    "--brand-accent-light": inputs.accent ? adaptBrandColor(inputs.accent, "light") : light,
    "--brand-accent-dark": inputs.accent
      ? inputs.darkMode === "same"
        ? inputs.accent
        : adaptBrandColor(inputs.accent, "dark")
      : dark,
  };
}
