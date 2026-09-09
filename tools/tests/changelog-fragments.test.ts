import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  escapingLinksOf,
  isEntryFile,
  isRealDate,
  parseFragmentName,
  suggestName,
  validateFragment,
} from "../lib/changelog-fragments";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FRAGMENTS_DIR = join(ROOT, "changelog.d");

const BODY = (date: string) => `- ${date}: Area — a summary. Some detail.\n`;

describe("isEntryFile", () => {
  it("exempts structure and documentation files", () => {
    expect(isEntryFile("_header.md")).toBe(false);
    expect(isEntryFile("README.md")).toBe(false);
  });

  it("treats any other .md as an entry, and ignores non-markdown", () => {
    expect(isEntryFile("2026-09-08-01-a-slug.md")).toBe(true);
    expect(isEntryFile("whatever.md")).toBe(true);
    expect(isEntryFile("notes.txt")).toBe(false);
  });
});

describe("parseFragmentName", () => {
  it("splits a conforming name into date, sequence and slug", () => {
    expect(parseFragmentName("2026-09-08-03-tooling-changelog-naming.md")).toEqual({
      date: "2026-09-08",
      sequence: "03",
      slug: "tooling-changelog-naming",
    });
  });

  // Each of these is a shape that used to land in changelog.d/ unnoticed.
  it.each([
    ["no date prefix at all", "tooling-ci-aggregate-gate.md"],
    ["date but no sequence", "2026-09-08-tooling-ci-aggregate-gate.md"],
    ["one-digit sequence", "2026-09-08-1-tooling.md"],
    ["three-digit sequence", "2026-09-08-001-tooling.md"],
    ["underscore separator", "2026-09-08_01_tooling.md"],
    ["underscore inside the slug", "2026-09-08-01-tooling_naming.md"],
    ["uppercase in the slug", "2026-09-08-01-Tooling.md"],
    ["a space in the slug", "2026-09-08-01-tooling naming.md"],
    ["a dot inside the slug", "2026-09-08-01-tooling.naming.md"],
    ["empty slug", "2026-09-08-01-.md"],
    ["missing slug entirely", "2026-09-08-01.md"],
    ["two-digit year", "26-09-08-01-tooling.md"],
    ["not markdown", "2026-09-08-01-tooling.txt"],
    ["trailing hyphen in the slug", "2026-09-08-01-tooling-.md"],
  ])("rejects %s", (_label, name) => {
    expect(parseFragmentName(name)).toBeNull();
  });
});

describe("isRealDate", () => {
  it("accepts real days, including a leap day", () => {
    expect(isRealDate("2026-09-08")).toBe(true);
    expect(isRealDate("2024-02-29")).toBe(true);
  });

  // The filename regex is happy with any two digits, so the calendar check is
  // what stops an entry sorting into a day that does not exist.
  it.each(["2026-02-31", "2026-13-01", "2026-00-10", "2026-09-00", "2025-02-29"])(
    "rejects %s",
    (date) => {
      expect(isRealDate(date)).toBe(false);
    },
  );
});

describe("validateFragment", () => {
  it("passes a conforming name whose date matches its entry", () => {
    expect(validateFragment("2026-09-08-01-a-slug.md", BODY("2026-09-08"))).toBeNull();
  });

  it("flags a name that does not match the pattern", () => {
    expect(validateFragment("tooling-ci-aggregate-gate.md", BODY("2026-09-08"))).toEqual({
      kind: "malformed",
      name: "tooling-ci-aggregate-gate.md",
    });
  });

  it("flags an impossible calendar date before looking at the body", () => {
    expect(validateFragment("2026-02-31-01-a-slug.md", BODY("2026-02-31"))).toEqual({
      kind: "impossible-date",
      name: "2026-02-31-01-a-slug.md",
      date: "2026-02-31",
    });
  });

  it("flags a filename date that disagrees with the entry date", () => {
    expect(validateFragment("2026-09-08-01-a-slug.md", BODY("2026-09-07"))).toEqual({
      kind: "date-mismatch",
      name: "2026-09-08-01-a-slug.md",
      fileDate: "2026-09-08",
      entryDate: "2026-09-07",
    });
  });

  it("flags a body with no date opener at all", () => {
    expect(validateFragment("2026-09-08-01-a-slug.md", "just some prose\n")).toEqual({
      kind: "date-mismatch",
      name: "2026-09-08-01-a-slug.md",
      fileDate: "2026-09-08",
      entryDate: null,
    });
  });

  it("checks the name alone when no contents are supplied", () => {
    expect(validateFragment("2026-09-08-01-a-slug.md")).toBeNull();
    expect(validateFragment("a-slug.md")).not.toBeNull();
  });
});

describe("suggestName", () => {
  it("dates an undated name and takes the first free sequence", () => {
    expect(suggestName("tooling-ci-aggregate-gate.md", "2026-09-08", new Set())).toBe(
      "2026-09-08-01-tooling-ci-aggregate-gate.md",
    );
  });

  it("skips sequences already taken on that date", () => {
    expect(suggestName("a-slug.md", "2026-09-08", new Set(["01", "02"]))).toBe(
      "2026-09-08-03-a-slug.md",
    );
  });

  it("does not double up a date prefix the author already started", () => {
    expect(suggestName("2026-09-08-a-slug.md", "2026-09-08", new Set())).toBe(
      "2026-09-08-01-a-slug.md",
    );
    expect(suggestName("2026-09-08-07-a-slug.md", "2026-09-08", new Set())).toBe(
      "2026-09-08-01-a-slug.md",
    );
  });

  it("normalises underscores, spaces and case into a kebab slug", () => {
    expect(suggestName("Tooling_CI Gate.md", "2026-09-08", new Set())).toBe(
      "2026-09-08-01-tooling-ci-gate.md",
    );
  });

  it("always suggests something the validator accepts", () => {
    const suggestion = suggestName("Tooling_CI Gate.md", "2026-09-08", new Set());
    expect(validateFragment(suggestion, BODY("2026-09-08"))).toBeNull();
  });
});

describe("escapingLinksOf", () => {
  it("finds a bare changelog.d-relative link", () => {
    expect(escapingLinksOf("see [x](../tools/foo.ts) here")).toEqual(["../tools/foo.ts"]);
  });

  // The form the house style uses for any path containing parentheses, and the
  // one the original rule missed: six such links reached develop unnoticed.
  it("finds the angle-bracket form", () => {
    expect(escapingLinksOf("see [x](<../services/web/src/app/(authed)/layout.tsx>) here")).toEqual([
      "../services/web/src/app/(authed)/layout.tsx",
    ]);
  });

  it("finds every occurrence, in source order", () => {
    expect(escapingLinksOf("[a](../one.ts) and [b](<../two.ts>) and [c](../three.ts)")).toEqual([
      "../one.ts",
      "../two.ts",
      "../three.ts",
    ]);
  });

  // An entry documenting this rule quotes the syntax ; that is prose, not a link.
  it("ignores link syntax inside inline code", () => {
    expect(escapingLinksOf("write `[x](../tools/foo.ts)` not that")).toEqual([]);
    expect(escapingLinksOf("write `[x](<../tools/foo.ts>)` not that")).toEqual([]);
  });

  it("ignores link syntax inside a fenced block", () => {
    expect(escapingLinksOf("text\n```\n[x](../tools/foo.ts)\n```\nmore")).toEqual([]);
  });

  it("still flags a real link on a line that also has code", () => {
    expect(escapingLinksOf("`code` and [x](../tools/foo.ts)")).toEqual(["../tools/foo.ts"]);
  });

  it("leaves correct root-relative links alone, in both forms", () => {
    expect(escapingLinksOf("[a](tools/foo.ts)")).toEqual([]);
    expect(escapingLinksOf("[a](<services/web/src/app/(authed)/layout.tsx>)")).toEqual([]);
    expect(escapingLinksOf("[a](https://example.com/../x)")).toEqual([]);
  });
});

// The guard is only worth anything if the directory it guards actually
// passes ; this is the regression that would catch a fragment slipping in
// through a path that skipped the hook and the CI job.
describe("the committed changelog.d/", () => {
  const entries = readdirSync(FRAGMENTS_DIR).filter(isEntryFile);

  it("has fragments to check", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("%s conforms", (name) => {
    const contents = readFileSync(join(FRAGMENTS_DIR, name), "utf8");
    expect(validateFragment(name, contents)).toBeNull();
  });
});
