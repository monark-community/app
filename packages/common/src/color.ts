// WCAG-relative luminance based foreground picker. The brand primary
// color is entirely operator-controlled — they can pick yellow, white,
// or any light pastel ; hardcoding a text color on top of it would make
// primary buttons unreadable. Computing the contrasting tone keeps
// `Sign in` / `Save` / badge labels and email CTA labels legible
// regardless of the chosen brand color.
//
// Lives in `@monark/common` rather than the web app because BOTH
// surfaces that paint text on the brand color need it : the root
// layout's `--primary-foreground` token and the notification email
// templates' CTA labels. Email is the reason it can't be web-only —
// those templates render in the api process.

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function expandHex(hex: string): string | null {
  if (!HEX_RE.test(hex)) return null;
  if (hex.length === 4) {
    const r = hex[1]!;
    const g = hex[2]!;
    const b = hex[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Returns the WCAG relative luminance of a hex color in [0, 1].
 * Pure black → 0, pure white → 1. Invalid hex throws ; callers should
 * gate with the same regex used upstream (`getBootstrapStatus`).
 */
export function relativeLuminance(hex: string): number {
  const full = expandHex(hex);
  if (!full) {
    throw new Error(`relativeLuminance: invalid hex color ${JSON.stringify(hex)}`);
  }
  const r = linearize(parseInt(full.slice(1, 3), 16));
  const g = linearize(parseInt(full.slice(3, 5), 16));
  const b = linearize(parseInt(full.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Picks `#000000` (black) or `#FFFFFF` (white) as the readable
 * foreground for text painted on the given background hex.
 *
 * Threshold 0.179 is the standard WCAG cross-over point where the
 * contrast ratio against pure white equals the ratio against pure
 * black ; above it, black text wins ; below it, white wins. This
 * matches what Material's "on-color" tokens and Tailwind's
 * accessibility lints converge on.
 *
 * Falls back to `#FFFFFF` for invalid input rather than throwing —
 * the upstream hex regex already filters bad values, and a
 * notification-related theme color shouldn't crash the root layout
 * if a future writer slips through.
 */
export function pickContrastForeground(hex: string): "#000000" | "#FFFFFF" {
  let luminance: number;
  try {
    luminance = relativeLuminance(hex);
  } catch {
    return "#FFFFFF";
  }
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

// ── Per-theme brand adaptation ────────────────────────────────────────
//
// One brand color has to work on two grounds : the near-white light theme
// and the near-black dark theme (their oklch lightness is fixed in the web
// app's globals.css, 0.985 and 0.17, so their luminance is known without
// knowing the tint). A black brand vanishes on the dark ground, a white or
// pale-yellow one on the light ground. `adaptBrandColor` returns the color
// to use in one theme : unchanged when it already stands out enough, else
// the same hue moved in lightness (lighter for dark, darker for light) just
// until it reaches the target contrast, easing chroma as it moves so a
// lifted navy doesn't turn neon.

/** Relative luminance of the light theme's background (oklch L 0.985). */
export const LIGHT_BACKGROUND_LUMINANCE = 0.985 ** 3;
/** Relative luminance of the dark theme's background (oklch L 0.17). */
export const DARK_BACKGROUND_LUMINANCE = 0.17 ** 3;
/** Below this contrast against a theme's background, the brand is adapted for that theme. */
export const BRAND_ADAPT_BELOW = 2;
/** The contrast an adapted brand is moved to (WCAG 1.4.11 non-text contrast). */
export const BRAND_ADAPT_TARGET = 3;

export type ThemeMode = "light" | "dark";

/** WCAG contrast ratio between two relative luminances. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Contrast of a hex color against the given theme's background. */
export function contrastOnTheme(hex: string, mode: ThemeMode): number {
  return contrastRatio(
    relativeLuminance(hex),
    mode === "dark" ? DARK_BACKGROUND_LUMINANCE : LIGHT_BACKGROUND_LUMINANCE,
  );
}

type Oklch = { l: number; c: number; h: number };

function toOklch(hex: string): Oklch {
  const full = expandHex(hex);
  if (!full) throw new Error(`toOklch: invalid hex color ${JSON.stringify(hex)}`);
  const [r, g, b] = [1, 3, 5].map((i) =>
    linearizeUnit(parseInt(full.slice(i, i + 2), 16) / 255),
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function fromOklch({ l: L, c: C, h: H }: Oklch): string {
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    rgb
      .map((x) => {
        const clamped = Math.min(1, Math.max(0, x));
        const encoded =
          clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
        return Math.round(encoded * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
      .toUpperCase()
  );
}

function linearizeUnit(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * The brand color to use in one theme. Returned unchanged (same string)
 * when its contrast against that theme's background is at least
 * `BRAND_ADAPT_BELOW` ; otherwise its lightness moves (up for dark, down
 * for light) until the contrast reaches `BRAND_ADAPT_TARGET`, with chroma
 * eased by up to half as the lightness travels. Invalid hex is returned
 * as-is, like `pickContrastForeground` never throwing into the layout.
 */
export function adaptBrandColor(hex: string, mode: ThemeMode): string {
  let start: Oklch;
  try {
    if (contrastOnTheme(hex, mode) >= BRAND_ADAPT_BELOW) return hex;
    start = toOklch(hex);
  } catch {
    return hex;
  }
  const direction = mode === "dark" ? 1 : -1;
  let adapted = hex;
  for (let step = 1; step <= 200; step += 1) {
    const l = Math.min(1, Math.max(0, start.l + direction * step * 0.005));
    const travelled = Math.abs(l - start.l);
    adapted = fromOklch({ l, c: start.c * Math.max(0.5, 1 - travelled * 1.2), h: start.h });
    if (contrastOnTheme(adapted, mode) >= BRAND_ADAPT_TARGET) break;
  }
  return adapted;
}
