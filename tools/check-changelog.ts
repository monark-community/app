// changelog.d/ fragment guard.
//
// Every entry fragment must be named `YYYY-MM-DD-NN-<slug>.md`, with the date
// matching the entry's own `- YYYY-MM-DD:` line, and must not link relative to
// changelog.d/. The rules live in tools/lib/changelog-fragments.ts so they can
// be unit-tested without a filesystem (tools/tests/changelog-fragments.test.ts)
// and stay shared with compile-changelog.ts ; this file is the CLI around them.
//
// The link rule was already in the compiler, but the compiler only runs on
// pushes to develop — after merge. Six fragments reached develop with
// changelog.d-relative links and left changelog-compile.yml failing on every
// push. Checking here means a PR catches it, and so does the commit.
//
// Why the prefix is worth enforcing: CHANGELOG.md is compiled in
// (date DESC, filename ASC) order, so an undated filename sorts by whatever
// its slug happens to start with and lands in an arbitrary place among that
// day's entries. Dating the file makes the compiled order match the order
// entries were actually written, and makes `ls changelog.d` readable as a
// timeline instead of an unsorted pile.
//
// Two ways to run it:
//   pnpm check:changelog                 every fragment in changelog.d/
//   pnpm check:changelog <paths…>        only those files (lint-staged)
//
// The path form is what the pre-commit hook uses, so an agent is told about a
// bad name the moment it commits rather than after a CI round trip. The bare
// form is the authoritative gate and runs in CI's repo-checks job.
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  entryDateOf,
  escapingLinksOf,
  isEntryFile,
  parseFragmentName,
  suggestName,
  validateFragment,
} from "./lib/changelog-fragments";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRAGMENTS_DIR = join(ROOT, "changelog.d");

const args = process.argv.slice(2);

// Sequence numbers already used per date, so a suggestion doesn't collide
// with a fragment that is already on disk.
const takenByDate = new Map<string, Set<string>>();
for (const name of readdirSync(FRAGMENTS_DIR)) {
  const parsed = isEntryFile(name) ? parseFragmentName(name) : null;
  if (!parsed) continue;
  const set = takenByDate.get(parsed.date) ?? new Set<string>();
  set.add(parsed.sequence);
  takenByDate.set(parsed.date, set);
}

// With no arguments, check the whole directory ; with arguments, check only
// the given paths (and ignore any that aren't changelog.d entries, since
// lint-staged hands over whatever matched its glob).
const targets =
  args.length > 0
    ? args
        .map((p) => resolve(p))
        .filter((p) => resolve(dirname(p)) === resolve(FRAGMENTS_DIR) && isEntryFile(basename(p)))
    : readdirSync(FRAGMENTS_DIR)
        .filter(isEntryFile)
        .map((name) => join(FRAGMENTS_DIR, name));

if (targets.length === 0) {
  console.log("check:changelog — ok (no changelog.d fragments to check).");
  process.exit(0);
}

const problems: string[] = [];

for (const path of targets) {
  const name = basename(path);
  const contents = readFileSync(path, "utf8");

  const escaping = escapingLinksOf(contents);
  if (escaping.length > 0) {
    problems.push(
      `  ${name}\n` +
        `      ${escaping.length} link(s) written relative to changelog.d/ instead of the\n` +
        `      repo root. The entry compiles into CHANGELOG.md at the root, so drop\n` +
        `      the leading "../":\n` +
        escaping.map((l) => `        ${l}  ->  ${l.replace(/^\.\.\//, "")}`).join("\n"),
    );
  }

  const problem = validateFragment(name, contents);
  if (!problem) continue;

  switch (problem.kind) {
    case "malformed": {
      const entryDate = entryDateOf(contents);
      if (!entryDate) {
        problems.push(
          `  ${name}\n` +
            `      does not match YYYY-MM-DD-NN-<slug>.md, and its body has no\n` +
            `      "- YYYY-MM-DD: …" opener to take the date from. Fix the entry\n` +
            `      format first (see changelog.d/README.md).`,
        );
        break;
      }
      const suggestion = suggestName(name, entryDate, takenByDate.get(entryDate) ?? new Set());
      problems.push(
        `  ${name}\n` +
          `      does not match YYYY-MM-DD-NN-<slug>.md. Rename to:\n` +
          `        git mv changelog.d/${name} changelog.d/${suggestion}`,
      );
      break;
    }
    case "impossible-date":
      problems.push(`  ${name}\n` + `      "${problem.date}" is not a real calendar date.`);
      break;
    case "date-mismatch":
      problems.push(
        `  ${name}\n` +
          `      filename says ${problem.fileDate} but the entry says ` +
          `${problem.entryDate ?? "(no date line)"}.\n` +
          `      Make them agree ; the filename date is what orders the entry.`,
      );
      break;
  }
}

if (problems.length > 0) {
  console.error(
    `check:changelog: FAIL — ${problems.length} problem(s) in changelog.d/.\n\n` +
      problems.join("\n") +
      `\n\nNaming: changelog.d/YYYY-MM-DD-NN-<slug>.md, where the date matches the\n` +
      `entry's own "- YYYY-MM-DD:" line, NN is a two-digit within-day sequence, and\n` +
      `<slug> is lowercase kebab-case (conventionally the branch name with "/" as "-").\n` +
      `Links: written from the repo root, since the entry compiles into CHANGELOG.md\n` +
      `there — "tools/foo.ts", not "../tools/foo.ts".\n` +
      `Full guidance: changelog.d/README.md.`,
  );
  process.exit(1);
}

// A repeated NN on one date is not fatal — two branches adding an entry on the
// same day can't see each other's choice, and failing here would strand every
// open PR the moment the second one merged, which is exactly the trap the
// single `ci-ok` gate exists to avoid. Ordering stays deterministic either way
// (filename ASC breaks the tie), so this is a nudge, not a gate.
const duplicates = [...takenByDate.entries()].flatMap(([date, seqs]) => {
  const names = readdirSync(FRAGMENTS_DIR).filter((n) => {
    const p = isEntryFile(n) ? parseFragmentName(n) : null;
    return p?.date === date;
  });
  return names.length > seqs.size ? [date] : [];
});
if (duplicates.length > 0) {
  console.warn(
    `check:changelog — note: repeated NN on ${duplicates.join(", ")}. ` +
      `Harmless (filename still breaks the tie), but pick the next free NN when you can.`,
  );
}

console.log(`check:changelog: ok (${targets.length} fragment(s) checked).`);
