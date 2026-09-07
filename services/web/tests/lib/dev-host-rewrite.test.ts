import { afterEach, describe, expect, it, vi } from "vitest";
import { rewriteForCurrentHost, swapLoopbackHost } from "@/lib/dev-host-rewrite";

// The LAN-dev "swap loopback for the current host" helper. Branches: server-
// side no-op, unparseable input, non-loopback (production) no-op, browser also
// on loopback (no-op), and the actual rewrite when a phone on the LAN loads a
// bundle whose URLs still say localhost. `window` is stubbed per case.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const onHost = (hostname: string) => vi.stubGlobal("window", { location: { hostname } });

describe("rewriteForCurrentHost", () => {
  it("is a no-op server-side (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(rewriteForCurrentHost("http://localhost:4000")).toBe("http://localhost:4000");
  });

  it("returns the input unchanged when it isn't a valid URL", () => {
    onHost("10.0.0.42");
    expect(rewriteForCurrentHost("not a url")).toBe("not a url");
  });

  it("leaves a non-loopback (production) URL alone", () => {
    onHost("10.0.0.42");
    expect(rewriteForCurrentHost("https://api.monark.app")).toBe("https://api.monark.app");
  });

  it("leaves a loopback URL alone when the browser is also on loopback", () => {
    onHost("localhost");
    expect(rewriteForCurrentHost("http://localhost:4000")).toBe("http://localhost:4000");
    onHost("127.0.0.1");
    expect(rewriteForCurrentHost("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
  });

  it("swaps the loopback host for the browser's LAN host, keeping port + protocol", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    onHost("10.0.0.42");
    expect(rewriteForCurrentHost("http://localhost:4000")).toBe("http://10.0.0.42:4000");
    expect(rewriteForCurrentHost("http://127.0.0.1:54321")).toBe("http://10.0.0.42:54321");
    expect(info).toHaveBeenCalled();
  });
});

// The pure core both the browser-side helper above and the server-side
// `rewriteForRequestHost` delegate to. Tested directly because the server
// twin feeds it a value derived from the request `Host` header, and the
// loopback gate is what stops a spoofed header relocating a production URL.
describe("swapLoopbackHost", () => {
  it("relocates a loopback URL onto the host the user is actually on", () => {
    expect(
      swapLoopbackHost("http://127.0.0.1:54321/storage/v1/object/public/a.webp", "10.0.0.42"),
    ).toBe("http://10.0.0.42:54321/storage/v1/object/public/a.webp");
  });

  it("preserves port, protocol, path and query", () => {
    expect(swapLoopbackHost("http://localhost:54321/o/a.webp?v=123", "10.0.0.42")).toBe(
      "http://10.0.0.42:54321/o/a.webp?v=123",
    );
  });

  it("leaves a non-loopback URL alone even when asked to move it", () => {
    // The production guard : a spoofed Host header must not be able to
    // relocate an asset URL that points at a real origin.
    expect(swapLoopbackHost("https://xyz.supabase.co/storage/a.webp", "evil.example")).toBe(
      "https://xyz.supabase.co/storage/a.webp",
    );
  });

  it("is a no-op when the user is also on loopback", () => {
    expect(swapLoopbackHost("http://127.0.0.1:54321/a.webp", "localhost")).toBe(
      "http://127.0.0.1:54321/a.webp",
    );
  });

  it("is a no-op when the current host is empty or the input isn't a URL", () => {
    expect(swapLoopbackHost("http://127.0.0.1:54321/a.webp", "")).toBe(
      "http://127.0.0.1:54321/a.webp",
    );
    expect(swapLoopbackHost("not a url", "10.0.0.42")).toBe("not a url");
  });
});
