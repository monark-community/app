// Rebuilds CHANGELOG.md from the per-entry fragments in changelog.d/.
//
// The fragments are the source of truth ; CHANGELOG.md is a generated
// artifact. That inversion exists because several agents and contributors
// work this repo at once: everyone appending to one shared file collides on
// the same insertion point every time, while everyone adding their own new
// file never collides at all. A PR only ever adds a fragment ; CHANGELOG.md
// is rewritten by CI on develop (.github/workflows/changelog-compile.yml),
// so no branch has to touch the compiled file and there is nothing to
// conflict over.
//
// Ordering is (date DESC, filename ASC). The historical fragments carry a
// `YYYY-MM-DD-NN-` prefix so their original within-day order is preserved
// exactly ; new fragments can be named freely, since a new entry's date
// almost always places it on its own.
//
// Usage:
//   pnpm changelog:compile           rewrite CHANGELOG.md
//   pnpm changelog:compile --check   exit 1 if CHANGELOG.md is out of date
//
// See changelog.d/README.md for the fragment format.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRAGMENTS_DIR = join(ROOT, "changelog.d");
const CHANGELOG_PATH = join(ROOT, "CHANGELOG.md");
const HEADER_FILE = "_header.md";
const ENTRY_DATE_RE = /^-\s*(\d{4}-\d{2}-\d{2}):/;

const checkOnly = process.argv.includes("--check");

// Files starting with "_" are structure (the header), not entries ; README.md
// documents the convention for humans.
const fragmentNames = readdirSync(FRAGMENTS_DIR)
  .filter((name) => name.endsWith(".md") && name !== "README.md" && !name.startsWith("_"))
  .sort();

if (fragmentNames.length === 0) {
  console.error(
    "changelog:compile — changelog.d/ has no entry fragments ; refusing to write an empty CHANGELOG.md.",
  );
  process.exit(1);
}

// Windows checkouts land these files with CRLF even though the git blobs are
// LF. Normalize for processing, restore on write, so the rebuild doesn't
// rewrite every line ending as a side effect.
const normalize = (s: string) => s.replace(/\r\n/g, "\n");

const fragments = fragmentNames.map((file) => {
  const text = normalize(readFileSync(join(FRAGMENTS_DIR, file), "utf8")).trim();
  const m = ENTRY_DATE_RE.exec(text);
  if (!m?.[1]) {
    console.error(
      `changelog:compile — ${file} doesn't start with "- YYYY-MM-DD: ..." (see changelog.d/README.md). Fix it before compiling.`,
    );
    process.exit(1);
  }
  // Fragments live in changelog.d/ but compile into CHANGELOG.md at the repo
  // root, so a link written relative to the fragment ("../tools/foo.ts") ends
  // up pointing one level above the repo. Easy to write, invisible once
  // compiled ; reject it here instead of shipping a dead link.
  const escaping = [...text.matchAll(/\]\((\.\.\/[^)]*)\)/g)].flatMap((x) => x[1] ?? []);
  if (escaping.length > 0) {
    console.error(
      `changelog:compile — ${file} has link(s) relative to changelog.d/ instead of the repo root:\n` +
        escaping.map((l) => `    ${l}  ->  ${l.replace(/^\.\.\//, "")}`).join("\n") +
        `\n  The entry compiles into CHANGELOG.md at the root, so drop the leading "../".`,
    );
    process.exit(1);
  }
  return { file, date: m[1], text };
});

// Newest first ; filename breaks ties so the output is deterministic and the
// historical within-day ordering (encoded in the NN prefix) is preserved.
fragments.sort((a, b) =>
  a.date === b.date ? a.file.localeCompare(b.file) : b.date.localeCompare(a.date),
);

const header = normalize(readFileSync(join(FRAGMENTS_DIR, HEADER_FILE), "utf8")).trimEnd();
const rebuilt = header + "\n\n" + fragments.map((f) => f.text).join("\n\n") + "\n";

const existingRaw = readFileSync(CHANGELOG_PATH, "utf8");
const usesCRLF = existingRaw.includes("\r\n");
const output = usesCRLF ? rebuilt.replace(/\n/g, "\r\n") : rebuilt;

if (checkOnly) {
  if (existingRaw === output) {
    console.log(
      `changelog:compile --check — CHANGELOG.md is up to date (${fragments.length} entries).`,
    );
    process.exit(0);
  }
  console.error(
    "changelog:compile --check — CHANGELOG.md is out of date ; run `pnpm changelog:compile`.",
  );
  process.exit(1);
}

writeFileSync(CHANGELOG_PATH, output, "utf8");
console.log(`changelog:compile — rebuilt CHANGELOG.md from ${fragments.length} fragments.`);
