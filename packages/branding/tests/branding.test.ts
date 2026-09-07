import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRANDING,
  brandingTemplateVars,
  DEFAULT_BRANDING,
  isBrandingConfigured,
} from "../src/index";

describe("branding/BRANDING", () => {
  it("declares every required field", () => {
    expect(BRANDING.appName).toBeTruthy();
    expect(BRANDING.tagline).toBeTruthy();
    expect(BRANDING.supportEmail).toBeTruthy();
    expect(BRANDING.totpIssuer).toBeTruthy();
    expect(BRANDING.fromEmail).toBeTruthy();
    expect(BRANDING.appUrl).toBeTruthy();
    expect(BRANDING.brandPrimary).toBeTruthy();
    expect(BRANDING.brandAccent).toBeTruthy();
    expect(BRANDING.logoSrc).toBeTruthy();
  });

  it("brandPrimary is a valid hex code", () => {
    expect(BRANDING.brandPrimary).toMatch(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  });

  it("brandAccent is a valid hex code", () => {
    expect(BRANDING.brandAccent).toMatch(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  });

  it("supportEmail looks like an email address", () => {
    // Loose RFC-5322 lite ; tightening to the full grammar costs more
    // than it catches in a config-source-of-truth check.
    expect(BRANDING.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it("appUrl is a parseable URL", () => {
    expect(() => new URL(BRANDING.appUrl)).not.toThrow();
  });

  it("logoSrc is a public-path string starting with /", () => {
    expect(BRANDING.logoSrc.startsWith("/")).toBe(true);
  });

  it("fromEmail is a parseable RFC 5322 envelope (loose check)", () => {
    // Either `Name <a@b.c>` or `a@b.c`. Both formats round-trip
    // through nodemailer ; we only verify the envelope contains an
    // `@` and resolves to something with a TLD-ish suffix.
    const envelope = BRANDING.fromEmail;
    const match = envelope.match(/<([^>]+)>$/) ?? [null, envelope];
    const address = match[1] ?? envelope;
    expect(address).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});

describe("branding/brandingTemplateVars", () => {
  it("returns the safe-to-template subset of BRANDING", () => {
    const vars = brandingTemplateVars();
    expect(vars).toEqual({
      appName: BRANDING.appName,
      tagline: BRANDING.tagline,
      supportEmail: BRANDING.supportEmail,
      appUrl: BRANDING.appUrl,
      brandPrimary: BRANDING.brandPrimary,
      brandAccent: BRANDING.brandAccent,
    });
  });

  it("does not leak fields that aren't safe to interpolate (logo, totp issuer)", () => {
    const vars = brandingTemplateVars() as Record<string, unknown>;
    expect(vars.logoSrc).toBeUndefined();
    expect(vars.totpIssuer).toBeUndefined();
    expect(vars.fromEmail).toBeUndefined();
  });

  it("returns a fresh object on each call (callers can mutate without side effects)", () => {
    const a = brandingTemplateVars();
    const b = brandingTemplateVars();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("branding/env resolution", () => {
  it("reads every NEXT_PUBLIC_ duplicate through a literal process.env access", () => {
    // Next.js makes NEXT_PUBLIC_* available to the browser by statically
    // replacing LITERAL `process.env.NEXT_PUBLIC_FOO` expressions at build
    // time. A computed `process.env[key]` lookup is invisible to that
    // transform and evaluates to undefined in the bundle, which silently
    // falls every field back to DEFAULT_BRANDING on the client.
    //
    // Guard the shape rather than the behaviour : the failure is invisible
    // at runtime on the server (where computed access works fine) and only
    // shows up in a browser, so a unit test can't observe it directly.
    const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    // Strip comments first — the block comment above the resolver spells
    // out `process.env[someKey]` as the thing NOT to do.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(/process\.env\s*\[/.test(code)).toBe(false);

    for (const key of [
      "NEXT_PUBLIC_BRANDING_APP_NAME",
      "NEXT_PUBLIC_BRANDING_TAGLINE",
      "NEXT_PUBLIC_BRANDING_SUPPORT_EMAIL",
      "NEXT_PUBLIC_BRANDING_TOTP_ISSUER",
      "NEXT_PUBLIC_BRANDING_FROM_EMAIL",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_BRANDING_PRIMARY",
      "NEXT_PUBLIC_BRANDING_ACCENT",
      "NEXT_PUBLIC_BRANDING_LOGO_SRC",
    ]) {
      expect(code).toContain(`process.env.${key}`);
    }
  });

  it("reports whether a field was configured or fell back to the default", () => {
    // Nothing is set in the test environment, so every field is a fallback.
    for (const key of Object.keys(DEFAULT_BRANDING) as (keyof typeof DEFAULT_BRANDING)[]) {
      expect(isBrandingConfigured(key)).toBe(BRANDING[key] !== DEFAULT_BRANDING[key]);
    }
  });
});
