import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("reads + normalizes the url and key", () => {
    const cfg = loadConfig({ MONARK_API_URL: "https://host.test/", MONARK_API_KEY: " mrk_abc " });
    expect(cfg).toEqual({ apiUrl: "https://host.test", apiKey: "mrk_abc" });
  });

  it("requires the URL", () => {
    expect(() => loadConfig({ MONARK_API_KEY: "mrk_abc" })).toThrow(/MONARK_API_URL/);
  });

  it("requires the key", () => {
    expect(() => loadConfig({ MONARK_API_URL: "https://host.test" })).toThrow(/MONARK_API_KEY/);
  });
});
