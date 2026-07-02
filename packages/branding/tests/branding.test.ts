import { describe, expect, it } from "vitest";
import { BRANDING, brandingTemplateVars } from "../src/index";

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
