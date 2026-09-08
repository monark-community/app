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
