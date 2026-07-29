import { describe, expect, it } from "vitest";
import { buildObjectKey, sanitizeFilename } from "../src/contracts/types";

// `sanitizeFilename` + `buildObjectKey` decide the storage path from a
// user-supplied filename — the boundary where a hostile name (path traversal,
// separators, unicode) must be neutralized. Pure, no DB.

describe("sanitizeFilename", () => {
  it("keeps a safe name and its extension", () => {
    expect(sanitizeFilename("report.pdf")).toBe("report.pdf");
  });

  it("replaces path separators and unsafe characters with dashes", () => {
    expect(sanitizeFilename("a/b\\c d.txt")).toBe("a-b-c-d.txt");
  });

  it("neutralizes path traversal (leading dots/slashes stripped)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("etc-passwd");
  });

  it("collapses repeats and trims leading/trailing dots + dashes", () => {
    expect(sanitizeFilename("  --weird--.name..")).toBe("weird-.name");
  });

  it("falls back to 'file' when nothing safe remains", () => {
    expect(sanitizeFilename("///")).toBe("file");
    expect(sanitizeFilename("")).toBe("file");
  });
});

describe("buildObjectKey", () => {
  it("prefixes the org id + file id (partitioning within one bucket)", () => {
    expect(buildObjectKey("org1", "fid", "My File.png")).toBe("org1/fid-My-File.png");
  });
});
