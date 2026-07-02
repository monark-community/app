import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enrichVars } from "../src/server/enrich";

describe("notifications/enrichVars", () => {
  const originalAppUrl = process.env.APP_URL;
  beforeEach(() => {
    delete process.env.APP_URL;
  });
  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  it("turns Date fields into ISO + locale-formatted companions", () => {
    const at = new Date("2026-05-01T14:30:00Z");
    const vars = enrichVars("auth.totp-enabled", { occurredAt: at }, "en");
    expect(vars.occurredAt).toBe(at.toISOString());
    expect(vars.occurredAtFormatted).toContain("2026");
    expect(vars.occurredAtFormatted).not.toContain("T");
  });

  it("formats the same Date differently for fr vs en", () => {
    const at = new Date("2026-05-01T14:30:00Z");
    const en = enrichVars("auth.totp-enabled", { occurredAt: at }, "en");
    const fr = enrichVars("auth.totp-enabled", { occurredAt: at }, "fr");
    expect(en.occurredAtFormatted).not.toBe(fr.occurredAtFormatted);
  });

  it("provides global links built from APP_URL", () => {
    process.env.APP_URL = "https://monark.app";
    const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en");
    expect(vars.appUrl).toBe("https://monark.app");
    // Per the route-segments work in 2026-05-05 : `accountLink`
    // surfaces in the deletion-scheduled email's "cancel" CTA so it
    // points at the danger tab. `securityLink` / `revokeLink` point
    // at the security tab where credentials + trusted devices live.
    expect(vars.accountLink).toBe("https://monark.app/account/danger");
    expect(vars.securityLink).toBe("https://monark.app/account/security");
    expect(vars.revokeLink).toBe("https://monark.app/account/security");
    expect(vars.signInLink).toBe("https://monark.app/signin");
  });

  it("strips trailing slash on APP_URL so links don't double-slash", () => {
    process.env.APP_URL = "https://monark.app/";
    const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en");
    expect(vars.accountLink).toBe("https://monark.app/account/danger");
  });

  it("falls back to localhost when APP_URL is unset", () => {
    const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en");
    expect(vars.appUrl).toBe("http://localhost:3000");
  });

  it("derives deviceWhere from country + ip for auth.new-device", () => {
    const vars = enrichVars(
      "auth.new-device",
      {
        deviceLabel: "Chrome on macOS",
        deviceCountry: "Canada",
        deviceIp: "203.0.113.42",
        seenAt: new Date(),
        revokeLink: "http://localhost:3000/auth/revoke-device/abc.def",
      },
      "en",
    );
    expect(vars.deviceWhere).toBe("Canada · 203.0.113.42");
    expect(vars.seenAtFormatted).toBeTruthy();
  });

  it("falls back to country-only or ip-only when one is missing", () => {
    const onlyCountry = enrichVars(
      "auth.new-device",
      {
        deviceLabel: "Chrome",
        deviceCountry: "Canada",
        deviceIp: null,
        seenAt: new Date(),
        revokeLink: "http://localhost:3000/auth/revoke-device/abc.def",
      },
      "en",
    );
    expect(onlyCountry.deviceWhere).toBe("Canada");

    const onlyIp = enrichVars(
      "auth.new-device",
      {
        deviceLabel: "Chrome",
        deviceCountry: null,
        deviceIp: "203.0.113.42",
        seenAt: new Date(),
        revokeLink: "http://localhost:3000/auth/revoke-device/abc.def",
      },
      "en",
    );
    expect(onlyIp.deviceWhere).toBe("203.0.113.42");
  });

  it("uses a localized fallback when both country and ip are absent", () => {
    const en = enrichVars(
      "auth.new-device",
      {
        deviceLabel: "Chrome",
        deviceCountry: null,
        deviceIp: null,
        seenAt: new Date(),
        revokeLink: "http://localhost:3000/auth/revoke-device/abc.def",
      },
      "en",
    );
    expect(en.deviceWhere).toBe("Unknown location");

    const fr = enrichVars(
      "auth.new-device",
      {
        deviceLabel: "Chrome",
        deviceCountry: null,
        deviceIp: null,
        seenAt: new Date(),
        revokeLink: "http://localhost:3000/auth/revoke-device/abc.def",
      },
      "fr",
    );
    expect(fr.deviceWhere).toBe("Lieu inconnu");
  });

  it("stringifies non-string non-Date values (numbers, booleans)", () => {
    const vars = enrichVars("auth.all-devices-revoked", { count: 7, occurredAt: new Date() }, "en");
    expect(vars.count).toBe("7");
  });

  it("renders null/undefined fields as empty strings", () => {
    const vars = enrichVars(
      "auth.new-device",
      {
        deviceLabel: "Chrome",
        deviceCountry: null,
        deviceIp: null,
        seenAt: new Date(),
        revokeLink: "http://localhost:3000/auth/revoke-device/abc.def",
      },
      "en",
    );
    expect(vars.deviceCountry).toBe("");
    expect(vars.deviceIp).toBe("");
  });

  it("passes the locale through so renderString's branch logic works", () => {
    const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "fr");
    expect(vars.locale).toBe("fr");
  });

  describe("logoUrl override (singleton-org branding)", () => {
    it("uses the override + builds a logoHtml <img> chunk when a non-empty URL is passed", () => {
      const url = "https://supabase.test/storage/v1/object/public/avatars/org-logos/abc/123.webp";
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en", {
        logoUrl: url,
      });
      expect(vars.logoUrl).toBe(url);
      expect(vars.logoHtml).toContain(`src="${url}"`);
      expect(vars.logoHtml).toContain("<img");
    });

    it("emits empty logoUrl + empty logoHtml when override is null", () => {
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en", {
        logoUrl: null,
      });
      // No BRANDING fallback for emails ; the deployer hasn't configured
      // an org logo, so the shell renders no `<img>` at all (the
      // wordmark below the logo slot still appears).
      expect(vars.logoUrl).toBe("");
      expect(vars.logoHtml).toBe("");
    });

    it("emits empty logoUrl + empty logoHtml when override is empty string", () => {
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en", {
        logoUrl: "",
      });
      expect(vars.logoUrl).toBe("");
      expect(vars.logoHtml).toBe("");
    });

    it("emits empty logoUrl + empty logoHtml when overrides is omitted entirely", () => {
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en");
      expect(vars.logoUrl).toBe("");
      expect(vars.logoHtml).toBe("");
    });
  });

  describe("primaryColor override (singleton-org accent)", () => {
    it("replaces brandPrimary when a non-empty color is passed", () => {
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en", {
        primaryColor: "#0066FF",
      });
      expect(vars.brandPrimary).toBe("#0066FF");
    });

    it("defaults brandPrimary to neutral black when override is null (NOT to BRANDING.brandPrimary)", () => {
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en", {
        primaryColor: null,
      });
      // Black, not starter-orange — deployers without a configured
      // org primaryColor see a neutral accent bar + wordmark instead
      // of the starter's identity color leaking into every email.
      expect(vars.brandPrimary).toBe("#000000");
    });

    it("defaults to black when override is empty string", () => {
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en", {
        primaryColor: "",
      });
      expect(vars.brandPrimary).toBe("#000000");
    });

    it("defaults to black when overrides is omitted entirely", () => {
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en");
      expect(vars.brandPrimary).toBe("#000000");
    });

    it("logoUrl + primaryColor overrides apply independently", () => {
      const vars = enrichVars("auth.totp-enabled", { occurredAt: new Date() }, "en", {
        logoUrl: "https://example.test/logo.png",
        primaryColor: "#112233",
      });
      expect(vars.logoUrl).toBe("https://example.test/logo.png");
      expect(vars.brandPrimary).toBe("#112233");
    });
  });
});
