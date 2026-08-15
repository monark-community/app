// Compiles per-PR changelog fragments (changelog.d/*.md) into CHANGELOG.md.
//
// Each PR adds one new file under changelog.d/ instead of hand-editing the
// shared CHANGELOG.md directly ; with several branches in flight at once,
// everyone editing the same insertion point at the top of one file is a
// guaranteed, recurring merge conflict, while everyone adding their own new
// file never conflicts. This script is the other half : it folds every
// pending fragment into CHANGELOG.md under `## [Unreleased]` (newest-dated
// first, ties broken by filename for determinism) and deletes the fragments
// it consumed. Runs automatically in CI on every push to develop
// (.github/workflows/changelog-compile.yml) ; safe to run locally too, and a
// no-op when changelog.d/ has no fragments (nothing to compile, nothing
// written, exit 0).
//
// See changelog.d/README.md for the fragment format + authoring convention.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRAGMENTS_DIR = join(ROOT, "changelog.d");
const CHANGELOG_PATH = join(ROOT, "CHANGELOG.md");
const UNRELEASED_HEADING = "## [Unreleased]";
const ENTRY_DATE_RE = /^-\s*(\d{4}-\d{2}-\d{2}):/;

const fragmentNames = readdirSync(FRAGMENTS_DIR)
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .sort();

if (fragmentNames.length === 0) {
  console.log("changelog:compile — no pending fragments, nothing to do.");
  process.exit(0);
}

type Fragment = { file: string; date: string; text: string };

// Windows checkouts of this repo land CHANGELOG.md with CRLF even though the
// git blob itself is LF ; a fragment file could be saved with either style
// too. Normalize everything to LF for the actual splice, then restore
// whatever line ending CHANGELOG.md was using on write — doing the insertion
// on a mixed \n / \r\n string is how a spurious blank line sneaks in (the
// collapse regex matches \n\n but not \r\n\r\n).
const normalize = (s: string) => s.replace(/\r\n/g, "\n");

const fragments: Fragment[] = fragmentNames.map((file) => {
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

// Newest first ; stable tiebreak on filename so output is deterministic.
fragments.sort((a, b) =>
  a.date === b.date ? a.file.localeCompare(b.file) : b.date.localeCompare(a.date),
);

const raw = readFileSync(CHANGELOG_PATH, "utf8");
const usesCRLF = raw.includes("\r\n");
const changelog = normalize(raw);
const headingIdx = changelog.indexOf(UNRELEASED_HEADING);
if (headingIdx === -1) {
  console.error(`changelog:compile — couldn't find "${UNRELEASED_HEADING}" in CHANGELOG.md.`);
  process.exit(1);
}
const insertAt = headingIdx + UNRELEASED_HEADING.length;
const block = "\n\n" + fragments.map((f) => f.text).join("\n");
const updated =
  changelog.slice(0, insertAt) + block + changelog.slice(insertAt).replace(/^\n\n/, "\n");

writeFileSync(CHANGELOG_PATH, usesCRLF ? updated.replace(/\n/g, "\r\n") : updated, "utf8");
for (const f of fragments) unlinkSync(join(FRAGMENTS_DIR, f.file));

console.log(`changelog:compile — folded ${fragments.length} fragment(s) into CHANGELOG.md:`);
for (const f of fragments) console.log(`  ${f.file} (${f.date})`);
