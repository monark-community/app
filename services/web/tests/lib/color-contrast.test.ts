import { describe, expect, it } from "vitest";
import { pickContrastForeground, relativeLuminance } from "../../src/lib/color-contrast";

describe("relativeLuminance", () => {
  it("returns 0 for pure black", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
  });

  it("returns 1 for pure white", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 6);
  });

  it("expands 3-digit hex equivalently to 6-digit", () => {
    // `#abc` ≡ `#aabbcc` per CSS color spec ; the formula should not
    // care which form arrived.
    expect(relativeLuminance("#abc")).toBeCloseTo(relativeLuminance("#aabbcc"), 6);
  });

  it("is case-insensitive on the hex string", () => {
    expect(relativeLuminance("#ABCDEF")).toBeCloseTo(relativeLuminance("#abcdef"), 6);
  });

  it("throws for non-hex input", () => {
    expect(() => relativeLuminance("rgb(1,2,3)")).toThrow();
    expect(() => relativeLuminance("not-a-color")).toThrow();
    expect(() => relativeLuminance("#12345")).toThrow();
  });
});

describe("pickContrastForeground", () => {
  it("returns white on pure black", () => {
    expect(pickContrastForeground("#000000")).toBe("#FFFFFF");
  });

  it("returns black on pure white", () => {
    expect(pickContrastForeground("#FFFFFF")).toBe("#000000");
  });

  it("returns black on light pastels (yellow, light blue, mint)", () => {
    // Each of these flips white-on-light readability — the failure
    // mode that motivated this helper.
    expect(pickContrastForeground("#FFFF00")).toBe("#000000"); // yellow
    expect(pickContrastForeground("#ADD8E6")).toBe("#000000"); // light blue
    expect(pickContrastForeground("#98FF98")).toBe("#000000"); // mint
  });

  it("returns white on deep saturated colors (navy, forest, maroon)", () => {
    expect(pickContrastForeground("#001F3F")).toBe("#FFFFFF"); // navy
    expect(pickContrastForeground("#0c4a6e")).toBe("#FFFFFF"); // sky-900
    expect(pickContrastForeground("#800000")).toBe("#FFFFFF"); // maroon
  });

  it("returns black on the starter orange (#F0870C)", () => {
    // The default brand color in `BRANDING` ; black-on-orange is the
    // existing readable pairing in globals.css and the helper must
    // not regress it.
    expect(pickContrastForeground("#F0870C")).toBe("#000000");
  });

  it("accepts 3-digit hex", () => {
    expect(pickContrastForeground("#000")).toBe("#FFFFFF");
    expect(pickContrastForeground("#fff")).toBe("#000000");
  });

  it("falls back to white on invalid hex rather than throwing", () => {
    // The root layout calls this synchronously during SSR ; crashing
    // would break every render. Upstream regex already filters bad
    // values, so this is defense-in-depth.
    expect(pickContrastForeground("not-a-hex")).toBe("#FFFFFF");
    expect(pickContrastForeground("")).toBe("#FFFFFF");
  });
});
