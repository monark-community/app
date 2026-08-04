import { afterEach, describe, expect, it, vi } from "vitest";
import { rewriteForCurrentHost } from "@/lib/dev-host-rewrite";

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
