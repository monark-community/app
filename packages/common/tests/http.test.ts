import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertOutboundUrlSafe, safeFetch } from "../src/http";

// The scheme/host guard shared by the webhooks target + automation webhook node.
// `http://` to a public host is the SSRF-adjacent case that must fail closed in
// production; private/loopback `http://` is allowed only in development.

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("assertOutboundUrlSafe", () => {
  it("allows https to a public host", () => {
    process.env.NODE_ENV = "production";
    expect(() => assertOutboundUrlSafe("https://example.com/hook")).not.toThrow();
  });

  it("rejects https to a literal private / reserved IP (SSRF)", () => {
    process.env.NODE_ENV = "production";
    for (const u of [
      "https://169.254.169.254/latest/meta-data/", // cloud metadata
      "https://10.0.0.5/",
      "https://192.168.1.10/",
      "https://172.16.0.1/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://[::ffff:127.0.0.1]/", // IPv4-mapped loopback
      "https://100.64.0.1/", // CGNAT
    ]) {
      expect(() => assertOutboundUrlSafe(u), u).toThrow();
    }
  });

  it("fails closed when NODE_ENV is unset (http to private host rejected)", () => {
    delete process.env.NODE_ENV;
    expect(() => assertOutboundUrlSafe("http://127.0.0.1:4000/hook")).toThrow();
    expect(() => assertOutboundUrlSafe("http://10.0.0.5/")).toThrow();
  });

  it("rejects a malformed / relative URL", () => {
    expect(() => assertOutboundUrlSafe("not a url")).toThrow();
    expect(() => assertOutboundUrlSafe("/relative/path")).toThrow();
  });

  it("rejects unsupported schemes", () => {
    expect(() => assertOutboundUrlSafe("ws://example.com")).toThrow();
    expect(() => assertOutboundUrlSafe("file:///etc/passwd")).toThrow();
  });

  describe("in production", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });
    it("rejects http entirely, even to a private host", () => {
      expect(() => assertOutboundUrlSafe("http://127.0.0.1:4000/hook")).toThrow();
      expect(() => assertOutboundUrlSafe("http://example.com")).toThrow();
    });
  });

  describe("in development", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });
    it("allows http only to loopback / RFC 1918 hosts", () => {
      expect(() => assertOutboundUrlSafe("http://127.0.0.1:4123/hook")).not.toThrow();
      expect(() => assertOutboundUrlSafe("http://localhost:3000")).not.toThrow();
      expect(() => assertOutboundUrlSafe("http://10.0.0.5")).not.toThrow();
      expect(() => assertOutboundUrlSafe("http://192.168.1.10")).not.toThrow();
    });
    it("rejects http to a public host", () => {
      expect(() => assertOutboundUrlSafe("http://example.com/hook")).toThrow();
    });
  });
});

describe("safeFetch maxBytes cap", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development"; // skip the prod DNS-resolution guard
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when the response body exceeds the cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(1000))),
    );
    await expect(safeFetch("https://example.com", { maxBytes: 100 })).rejects.toThrow(/cap/i);
  });

  it("returns the (bounded) body when under the cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("hello")),
    );
    const res = await safeFetch("https://example.com", { maxBytes: 100 });
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe("hello");
  });
});
