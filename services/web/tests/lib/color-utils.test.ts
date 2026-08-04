import { describe, expect, it } from "vitest";
import {
  formatCmyk,
  formatColor,
  formatHsl,
  formatRgb,
  getContrastText,
  hexToCmyk,
  hexToHsl,
  hexToRgb,
} from "@/lib/color-utils";

// Pure hex → RGB/HSL/CMYK color math behind the role/brand color picker. Well-
// known colors have known conversions, so exact assertions pin every branch :
// the 3-digit shorthand, the achromatic (max === min) HSL path, each hue
// sextant, and the black special-case in CMYK.

describe("hexToRgb", () => {
  it("parses 6-digit hex, with or without the leading #", () => {
    expect(hexToRgb("#F0870C")).toEqual({ r: 240, g: 135, b: 12 });
    expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0 });
  });
  it("expands 3-digit shorthand", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#0a0")).toEqual({ r: 0, g: 170, b: 0 });
  });
});

describe("hexToHsl", () => {
  it("returns an achromatic result when max === min (white/black/gray)", () => {
    expect(hexToHsl("#ffffff")).toEqual({ h: 0, s: 0, l: 100 });
    expect(hexToHsl("#000000")).toEqual({ h: 0, s: 0, l: 0 });
    expect(hexToHsl("#808080")).toEqual({ h: 0, s: 0, l: 50 });
  });
  it("computes hue per sextant for the primaries", () => {
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 }); // max === r
    expect(hexToHsl("#00ff00")).toEqual({ h: 120, s: 100, l: 50 }); // max === g
    expect(hexToHsl("#0000ff")).toEqual({ h: 240, s: 100, l: 50 }); // max === b
  });
  it("wraps hue past red (the g < b branch) and takes the l > 0.5 saturation path", () => {
    expect(hexToHsl("#ff00ff")).toEqual({ h: 300, s: 100, l: 50 }); // magenta: g < b
    expect(hexToHsl("#ff8080")).toEqual({ h: 0, s: 100, l: 75 }); // light red: l > 0.5
  });
});

describe("hexToCmyk", () => {
  it("special-cases pure black to full key", () => {
    expect(hexToCmyk("#000000")).toEqual({ c: 0, m: 0, y: 0, k: 100 });
  });
  it("converts white, a primary, and a gray", () => {
    expect(hexToCmyk("#ffffff")).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    expect(hexToCmyk("#ff0000")).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    expect(hexToCmyk("#808080")).toEqual({ c: 0, m: 0, y: 0, k: 50 });
  });
});

describe("format helpers", () => {
  it("formats rgb / hsl / cmyk strings", () => {
    expect(formatRgb("#F0870C")).toBe("rgb(240, 135, 12)");
    expect(formatHsl("#ff0000")).toBe("hsl(0, 100%, 50%)");
    expect(formatCmyk("#ff0000")).toBe("cmyk(0%, 100%, 100%, 0%)");
  });

  it("formatColor dispatches on the format and upper-cases hex", () => {
    expect(formatColor("#f0870c", "hex")).toBe("#F0870C");
    expect(formatColor("#ff0000", "rgb")).toBe("rgb(255, 0, 0)");
    expect(formatColor("#ff0000", "hsl")).toBe("hsl(0, 100%, 50%)");
    expect(formatColor("#ff0000", "cmyk")).toBe("cmyk(0%, 100%, 100%, 0%)");
  });
});

describe("getContrastText", () => {
  it("picks black on light backgrounds and white on dark", () => {
    expect(getContrastText("#ffffff")).toBe("#000000");
    expect(getContrastText("#000000")).toBe("#FFFFFF");
    expect(getContrastText("#0000ff")).toBe("#FFFFFF"); // low luminance
    expect(getContrastText("#ffff00")).toBe("#000000"); // high luminance
  });
});
