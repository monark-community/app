/** Parse a hex color string to RGB components (0-255). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Format RGB as "rgb(r, g, b)". */
export function formatRgb(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Convert hex to HSL. Returns { h: 0-360, s: 0-100, l: 0-100 }. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Format HSL as "hsl(h, s%, l%)". */
export function formatHsl(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** Convert hex to CMYK. Returns { c, m, y, k } as 0-100. */
export function hexToCmyk(hex: string): { c: number; m: number; y: number; k: number } {
  const { r, g, b } = hexToRgb(hex);
  if (r === 0 && g === 0 && b === 0) return { c: 0, m: 0, y: 0, k: 100 };
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

/** Format CMYK as "cmyk(c%, m%, y%, k%)". */
export function formatCmyk(hex: string): string {
  const { c, m, y, k } = hexToCmyk(hex);
  return `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`;
}

export type ColorFormat = "hex" | "rgb" | "hsl" | "cmyk";

/** Format a hex color in the given format. */
export function formatColor(hex: string, format: ColorFormat): string {
  switch (format) {
    case "hex":
      return hex.toUpperCase();
    case "rgb":
      return formatRgb(hex);
    case "hsl":
      return formatHsl(hex);
    case "cmyk":
      return formatCmyk(hex);
  }
}

/** Get text color (black or white) for contrast against a background hex. */
export function getContrastText(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}
