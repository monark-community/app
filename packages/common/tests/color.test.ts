import { describe, expect, it } from "vitest";
import {
  adaptBrandColor,
  BRAND_ADAPT_BELOW,
  BRAND_ADAPT_TARGET,
  contrastOnTheme,
  contrastRatio,
  pickContrastForeground,
  relativeLuminance,
} from "../src/color";

describe("adaptBrandColor", () => {
  it("leaves a brand that already stands out on the theme untouched", () => {
    expect(adaptBrandColor("#F88D10", "dark")).toBe("#F88D10");
    expect(adaptBrandColor("#2563EB", "light")).toBe("#2563EB");
    expect(adaptBrandColor("#2563EB", "dark")).toBe("#2563EB");
  });

  it("keeps Monark orange in light mode (2.3:1 sits above the adapt threshold)", () => {
    expect(contrastOnTheme("#F88D10", "light")).toBeGreaterThan(BRAND_ADAPT_BELOW);
    expect(adaptBrandColor("#F88D10", "light")).toBe("#F88D10");
  });

  it("lifts a black brand in dark mode to the target contrast", () => {
    const adapted = adaptBrandColor("#000000", "dark");
    expect(adapted).not.toBe("#000000");
    expect(contrastOnTheme(adapted, "dark")).toBeGreaterThanOrEqual(BRAND_ADAPT_TARGET);
    // Whatever the lifted color, the text painted on it stays readable.
    const foreground = pickContrastForeground(adapted);
    expect(
      contrastRatio(relativeLuminance(foreground), relativeLuminance(adapted)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens a white or pale-yellow brand in light mode", () => {
    for (const hex of ["#FFFFFF", "#FFD600"]) {
      const adapted = adaptBrandColor(hex, "light");
      expect(adapted).not.toBe(hex);
      expect(contrastOnTheme(adapted, "light")).toBeGreaterThanOrEqual(BRAND_ADAPT_TARGET);
    }
  });

  it("keeps the hue family of a dark saturated brand when lifting it", () => {
    const adapted = adaptBrandColor("#6C0A84", "dark");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(adapted.slice(i, i + 2), 16));
    // Still a purple : red and blue both clearly above green.
    expect(r).toBeGreaterThan(g!);
    expect(b).toBeGreaterThan(g!);
  });

  it("returns invalid input unchanged instead of throwing", () => {
    expect(adaptBrandColor("not-a-color", "dark")).toBe("not-a-color");
  });
});
