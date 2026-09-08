import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { effectiveValue, isSwallowedByComment, readEnvFile } from "./env-file";

// Uses `node:test` rather than vitest : `tools/` is not a workspace
// package, so it has no vitest config to inherit and none of the other
// tools carry tests. The built-in runner needs no dependency and no CI
// wiring — `pnpm test:preflight` runs it. See tools/preflight/README.md.

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
    assert.equal(file.entries.get("APP_URL")?.value, "http://localhost:3000");
  });

  it("reports a missing file rather than throwing", () => {
    const file = readEnvFile(join(dir, "does-not-exist"));
    assert.equal(file.exists, false);
    assert.equal(file.entries.size, 0);
  });

  it("skips comments and blank lines", () => {
    const file = envFileWith("# a comment\n\n  \nA=1\n");
    assert.equal(file.entries.size, 1);
    assert.equal(file.entries.get("A")?.value, "1");
  });

  it("keeps a quoted value intact, including a leading hash", () => {
    const file = envFileWith('BRANDING_PRIMARY="#2563EB"\n');
    assert.equal(file.entries.get("BRANDING_PRIMARY")?.value, "#2563EB");
  });

  it("handles single quotes the same way", () => {
    const file = envFileWith("BRANDING_PRIMARY='#2563EB'\n");
    assert.equal(file.entries.get("BRANDING_PRIMARY")?.value, "#2563EB");
  });

  // The whole reason this parser exists rather than reading process.env.
  it("truncates an unquoted value at the first hash, as the runtime does", () => {
    const file = envFileWith("BRANDING_PRIMARY=#2563EB\n");
    assert.equal(file.entries.get("BRANDING_PRIMARY")?.value, "");
    assert.equal(file.entries.get("BRANDING_PRIMARY")?.rawValue, "#2563EB");
  });

  it("strips a trailing inline comment", () => {
    const file = envFileWith("PORT=4000 # the api port\n");
    assert.equal(file.entries.get("PORT")?.value, "4000");
  });

  it("records 1-based line numbers so a report can point at the line", () => {
    const file = envFileWith("# header\nA=1\nB=2\n");
    assert.equal(file.entries.get("A")?.line, 2);
    assert.equal(file.entries.get("B")?.line, 3);
  });

  it("ignores lines that are not assignments", () => {
    const file = envFileWith("not an assignment\n=novalue\n9INVALID=1\nOK=1\n");
    assert.deepEqual([...file.entries.keys()], ["OK"]);
  });

  it("keeps an '=' that appears inside the value", () => {
    const file = envFileWith("DATABASE_URL=postgresql://u:p@h:5432/db?x=1\n");
    assert.equal(file.entries.get("DATABASE_URL")?.value, "postgresql://u:p@h:5432/db?x=1");
  });
});

describe("isSwallowedByComment", () => {
  it("is true for an unquoted value that began with a hash", () => {
    const file = envFileWith("C=#abcdef\n");
    assert.equal(isSwallowedByComment(file.entries.get("C")), true);
  });

  it("is false for a quoted hash value", () => {
    const file = envFileWith('C="#abcdef"\n');
    assert.equal(isSwallowedByComment(file.entries.get("C")), false);
  });

  it("is false for a genuinely blank value", () => {
    const file = envFileWith("C=\n");
    assert.equal(isSwallowedByComment(file.entries.get("C")), false);
  });

  it("is false for an absent key", () => {
    const file = envFileWith("");
    assert.equal(isSwallowedByComment(file.entries.get("NOPE")), false);
  });
});

describe("effectiveValue", () => {
  it("prefers the real environment over the file", () => {
    const file = envFileWith("A=from-file\n");
    process.env.A = "from-process";
    assert.equal(effectiveValue(file, "A"), "from-process");
    delete process.env.A;
  });

  it("falls back to the file when the environment is unset or blank", () => {
    const file = envFileWith("A=from-file\n");
    process.env.A = "   ";
    assert.equal(effectiveValue(file, "A"), "from-file");
    delete process.env.A;
  });

  it("returns an empty string when neither carries a value", () => {
    const file = envFileWith("");
    assert.equal(effectiveValue(file, "MISSING_EVERYWHERE"), "");
  });
});

after(() => {
  // The temp dir is disposable ; leaving it costs nothing and removing
  // it risks racing a still-open handle on Windows.
});
