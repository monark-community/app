import { afterEach, describe, expect, it, vi } from "vitest";

// Server-side twin of the dev host rewrite. It reads the request `Host`
// header, so unlike the browser helper its input is attacker-influencable
// — most of these cases are about the two guards that keep that safe:
// the configured URL must itself be loopback, and the destination must be
// a private host.

const headersMock = vi.fn();
vi.mock("next/headers", () => ({ headers: () => headersMock() }));

const { rewriteForRequestHost } = await import("@/lib/request-host-rewrite");

const LOOPBACK_ASSET = "http://127.0.0.1:54321/storage/v1/object/public/avatars/logo.webp";
const DEPLOYED_ASSET = "https://xyz.supabase.co/storage/v1/object/public/avatars/logo.webp";

function onRequestHost(host: string | null) {
  headersMock.mockReturnValue({
    get: (name: string) => (name.toLowerCase() === "host" ? host : null),
  });
}

afterEach(() => {
  headersMock.mockReset();
});

describe("rewriteForRequestHost", () => {
  it("relocates a loopback asset onto the LAN host the request came in on", async () => {
    onRequestHost("10.0.0.42:3000");
    await expect(rewriteForRequestHost(LOOPBACK_ASSET)).resolves.toBe(
      "http://10.0.0.42:54321/storage/v1/object/public/avatars/logo.webp",
    );
  });

  it("leaves the asset alone when the request is already on loopback", async () => {
    onRequestHost("localhost:3000");
    await expect(rewriteForRequestHost(LOOPBACK_ASSET)).resolves.toBe(LOOPBACK_ASSET);
  });

  it("never relocates a deployed (non-loopback) asset URL", async () => {
    // The production guard : even a private-looking Host must not move an
    // asset that already points at a real origin.
    onRequestHost("10.0.0.42:3000");
    await expect(rewriteForRequestHost(DEPLOYED_ASSET)).resolves.toBe(DEPLOYED_ASSET);
  });

  it("ignores a spoofed public Host header", async () => {
    onRequestHost("evil.example");
    await expect(rewriteForRequestHost(LOOPBACK_ASSET)).resolves.toBe(LOOPBACK_ASSET);
  });

  it("accepts the private shapes a phone on your own network actually uses", async () => {
    for (const host of [
      "192.168.1.50:3000",
      "172.16.4.9:3000",
      "169.254.1.2:3000",
      "100.101.102.103:3000",
      "dev-pc.local:3000",
    ]) {
      onRequestHost(host);
      const rewritten = await rewriteForRequestHost(LOOPBACK_ASSET);
      expect(rewritten).not.toBe(LOOPBACK_ASSET);
      expect(rewritten).toContain(":54321/storage/");
    }
  });

  it("rejects hosts just outside the private ranges", async () => {
    for (const host of ["172.15.0.1:3000", "172.32.0.1:3000", "100.63.0.1:3000"]) {
      onRequestHost(host);
      await expect(rewriteForRequestHost(LOOPBACK_ASSET)).resolves.toBe(LOOPBACK_ASSET);
    }
  });

  it("prefers x-forwarded-host when a proxy set one", async () => {
    headersMock.mockReturnValue({
      get: (name: string) => {
        const key = name.toLowerCase();
        if (key === "x-forwarded-host") return "10.0.0.42:3000";
        if (key === "host") return "localhost:3000";
        return null;
      },
    });
    await expect(rewriteForRequestHost(LOOPBACK_ASSET)).resolves.toContain("10.0.0.42:54321");
  });

  it("passes null / undefined straight through", async () => {
    onRequestHost("10.0.0.42:3000");
    await expect(rewriteForRequestHost(null)).resolves.toBeNull();
    await expect(rewriteForRequestHost(undefined)).resolves.toBeUndefined();
  });

  it("falls back to the input when there is no request scope", async () => {
    // `headers()` throws outside a request (static generation, scripts).
    headersMock.mockImplementation(() => {
      throw new Error("called outside a request scope");
    });
    await expect(rewriteForRequestHost(LOOPBACK_ASSET)).resolves.toBe(LOOPBACK_ASSET);
  });
});
