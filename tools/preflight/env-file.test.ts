import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveValue, isSwallowedByComment, readEnvFile } from "./env-file";

const dir = mkdtempSync(join(tmpdir(), "preflight-env-"));
let counter = 0;

function envFileWith(contents: string) {
  const path = join(dir, `env-${counter++}`);
  writeFileSync(path, contents, "utf8");
  return readEnvFile(path);
}

describe("readEnvFile", () => {
  it("reads a plain key=value", () => {
    const file = envFileWith("APP_URL=http://localhost:3000\n");
    expect(file.entries.get("APP_URL")?.value).toBe("http://localhost:3000");
  });

  it("reports a missing file rather than throwing", () => {
    const file = readEnvFile(join(dir, "does-not-exist"));
    expect(file.exists).toBe(false);
    expect(file.entries.size).toBe(0);
  });

  it("skips comments and blank lines", () => {
    const file = envFileWith("# a comment\n\n  \nA=1\n");
    expect(file.entries.size).toBe(1);
    expect(file.entries.get("A")?.value).toBe("1");
  });

  it("keeps a quoted value intact, including a leading hash", () => {
    const file = envFileWith('BRANDING_PRIMARY="#2563EB"\n');
    expect(file.entries.get("BRANDING_PRIMARY")?.value).toBe("#2563EB");
  });

  it("handles single quotes the same way", () => {
    const file = envFileWith("BRANDING_PRIMARY='#2563EB'\n");
    expect(file.entries.get("BRANDING_PRIMARY")?.value).toBe("#2563EB");
  });

  // The whole reason this parser exists rather than reading process.env.
  it("truncates an unquoted value at the first hash, as the runtime does", () => {
    const file = envFileWith("BRANDING_PRIMARY=#2563EB\n");
    expect(file.entries.get("BRANDING_PRIMARY")?.value).toBe("");
    expect(file.entries.get("BRANDING_PRIMARY")?.rawValue).toBe("#2563EB");
  });

  it("strips a trailing inline comment", () => {
    const file = envFileWith("PORT=4000 # the api port\n");
    expect(file.entries.get("PORT")?.value).toBe("4000");
  });

  it("records 1-based line numbers so a report can point at the line", () => {
    const file = envFileWith("# header\nA=1\nB=2\n");
    expect(file.entries.get("A")?.line).toBe(2);
    expect(file.entries.get("B")?.line).toBe(3);
  });

  it("ignores lines that are not assignments", () => {
    const file = envFileWith("not an assignment\n=novalue\n9INVALID=1\nOK=1\n");
    expect([...file.entries.keys()]).toEqual(["OK"]);
  });

  it("keeps an '=' that appears inside the value", () => {
    const file = envFileWith("DATABASE_URL=postgresql://u:p@h:5432/db?x=1\n");
    expect(file.entries.get("DATABASE_URL")?.value).toBe("postgresql://u:p@h:5432/db?x=1");
  });
});

describe("isSwallowedByComment", () => {
  it("is true for an unquoted value that began with a hash", () => {
    const file = envFileWith("C=#abcdef\n");
    expect(isSwallowedByComment(file.entries.get("C"))).toBe(true);
  });

  it("is false for a quoted hash value", () => {
    const file = envFileWith('C="#abcdef"\n');
    expect(isSwallowedByComment(file.entries.get("C"))).toBe(false);
  });

  it("is false for a genuinely blank value", () => {
    const file = envFileWith("C=\n");
    expect(isSwallowedByComment(file.entries.get("C"))).toBe(false);
  });

  it("is false for an absent key", () => {
    const file = envFileWith("");
    expect(isSwallowedByComment(file.entries.get("NOPE"))).toBe(false);
  });
});

describe("effectiveValue", () => {
  it("prefers the real environment over the file", () => {
    const file = envFileWith("A=from-file\n");
    process.env.A = "from-process";
    expect(effectiveValue(file, "A")).toBe("from-process");
    delete process.env.A;
  });

  it("falls back to the file when the environment is unset or blank", () => {
    const file = envFileWith("A=from-file\n");
    process.env.A = "   ";
    expect(effectiveValue(file, "A")).toBe("from-file");
    delete process.env.A;
  });

  it("returns an empty string when neither carries a value", () => {
    const file = envFileWith("");
    expect(effectiveValue(file, "MISSING_EVERYWHERE")).toBe("");
  });
});
