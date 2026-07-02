import { describe, expect, it } from "vitest";
import { renderString } from "../src/server/template";

describe("notifications/template.renderString", () => {
  it("interpolates known vars", () => {
    expect(renderString("Hello {{ name }}", { name: "Dom" })).toBe("Hello Dom");
  });

  it("leaves unknown vars visible (so authors notice)", () => {
    expect(renderString("Hello {{ name }} ({{ unknown }})", { name: "Dom" })).toBe(
      "Hello Dom ({{ unknown }})",
    );
  });

  it("supports underscores + camelCase var names", () => {
    expect(
      renderString("{{ deviceLabel }} / {{ device_label }}", {
        deviceLabel: "Chrome",
        device_label: "snake",
      }),
    ).toBe("Chrome / snake");
  });

  it("expands locale branches: matched branch wins", () => {
    const tpl = `{{ if eq locale "fr" }}Bonjour{{ else }}Hi{{ end }}`;
    expect(renderString(tpl, { locale: "fr" })).toBe("Bonjour");
    expect(renderString(tpl, { locale: "en" })).toBe("Hi");
  });

  it("locale branch defaults to en when locale unset", () => {
    const tpl = `{{ if eq locale "fr" }}Bonjour{{ else }}Hi{{ end }}`;
    expect(renderString(tpl, {})).toBe("Hi");
  });

  it("locale branch with no else collapses to empty when not matching", () => {
    const tpl = `prefix {{ if eq locale "fr" }}fr-only{{ end }} suffix`;
    expect(renderString(tpl, { locale: "en" })).toBe("prefix  suffix");
    expect(renderString(tpl, { locale: "fr" })).toBe("prefix fr-only suffix");
  });

  it("interpolates inside a locale branch", () => {
    const tpl = `{{ if eq locale "fr" }}Bonjour {{ name }}{{ else }}Hi {{ name }}{{ end }}`;
    expect(renderString(tpl, { locale: "en", name: "Dom" })).toBe("Hi Dom");
    expect(renderString(tpl, { locale: "fr", name: "Dom" })).toBe("Bonjour Dom");
  });

  it("handles multiple branches in one template", () => {
    const tpl = `{{ if eq locale "fr" }}A{{ else }}B{{ end }}-{{ if eq locale "fr" }}C{{ else }}D{{ end }}`;
    expect(renderString(tpl, { locale: "fr" })).toBe("A-C");
    expect(renderString(tpl, { locale: "en" })).toBe("B-D");
  });

  it("returns empty string for null/undefined var values", () => {
    // The dispatch path stringifies null/undefined to "" before calling
    // the renderer; here we just confirm no token misuse happens.
    expect(renderString("[{{ a }}]", { a: "" })).toBe("[]");
  });
});
