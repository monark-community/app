// The changelog.d/ fragment rules, as pure functions.
//
// Kept separate from the CLI in tools/check-changelog.ts so they can be
// unit-tested without touching the filesystem, and so compile-changelog.ts
// reuses the same definitions rather than restating them.
//
// Convention:  YYYY-MM-DD-NN-<slug>.md
//
//   2026-09-08-01-bugfix-achievement-layout.md
//   └── date ──┘└NN┘└──────── slug ────────┘
//
// The date is the entry's own date (the `- YYYY-MM-DD:` line inside the
// file) and MUST match it ; a filename that claims a different day than the
// entry it holds is worse than no prefix at all, because the sort order and
// the rendered date silently disagree. `NN` is a two-digit within-day
// sequence preserving the order entries were added on that date. The slug is
// lowercase kebab-case, conventionally the branch name with `/` flattened to
// `-` (`fix/white-label-first-run` -> `fix-white-label-first-run`).
//
// Files beginning with `_` are structure (`_header.md`), not entries, and
// README.md documents the convention for humans ; both are exempt.

/** Files in changelog.d/ that are not entries and carry no date prefix. */
export const NON_ENTRY_FILES = new Set(["README.md"]);

/** Structure files are prefixed with "_" (currently just `_header.md`). */
export const STRUCTURE_PREFIX = "_";

/**
 * `YYYY-MM-DD-NN-<slug>.md`. The slug is lowercase alphanumeric + hyphens and
 * must not be empty ; uppercase, spaces, underscores and dots inside the slug
 * are all rejected so the sort order stays predictable across platforms.
 */
export const FRAGMENT_NAME_RE = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/** The `- YYYY-MM-DD:` opener of an entry, whose date the filename must echo. */
export const ENTRY_DATE_RE = /^-\s*(\d{4}-\d{2}-\d{2}):/m;

/** True for the files that are exempt from the convention entirely. */
export function isEntryFile(name: string): boolean {
  return name.endsWith(".md") && !name.startsWith(STRUCTURE_PREFIX) && !NON_ENTRY_FILES.has(name);
}

export type NameProblem =
  | { kind: "malformed"; name: string }
  | { kind: "impossible-date"; name: string; date: string }
  | { kind: "date-mismatch"; name: string; fileDate: string; entryDate: string | null };

export type ParsedName = { date: string; sequence: string; slug: string };

/** Parses a conforming filename, or returns null when it does not conform. */
export function parseFragmentName(name: string): ParsedName | null {
  const m = FRAGMENT_NAME_RE.exec(name);
  if (!m) return null;
  const [, year, month, day, sequence, slug] = m;
  return { date: `${year}-${month}-${day}`, sequence: sequence!, slug: slug! };
}

/**
 * True when `date` ("YYYY-MM-DD") is a real calendar day. The regex alone
 * happily accepts 2026-02-31 or month 13, which would sort into a day that
 * does not exist and quietly misplace the entry.
 */
export function isRealDate(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const asDate = new Date(Date.UTC(y, m - 1, d));
  return (
    asDate.getUTCFullYear() === y && asDate.getUTCMonth() === m - 1 && asDate.getUTCDate() === d
  );
}

/** Pulls the `- YYYY-MM-DD:` date out of a fragment's body, if present. */
export function entryDateOf(contents: string): string | null {
  return ENTRY_DATE_RE.exec(contents)?.[1] ?? null;
}

/**
 * Validates one fragment. `contents` is optional : pass it to also check that
 * the filename's date matches the entry's own date, omit it to check the
 * filename shape alone.
 */
export function validateFragment(name: string, contents?: string): NameProblem | null {
  const parsed = parseFragmentName(name);
  if (!parsed) return { kind: "malformed", name };
  if (!isRealDate(parsed.date)) {
    return { kind: "impossible-date", name, date: parsed.date };
  }
  if (contents === undefined) return null;
  const entryDate = entryDateOf(contents);
  if (entryDate !== parsed.date) {
    return { kind: "date-mismatch", name, fileDate: parsed.date, entryDate };
  }
  return null;
}

/**
 * Suggests a conforming name for a non-conforming one. `takenSequences` is
 * the set of `NN` values already used on that date, so the suggestion lands
 * on the next free slot instead of colliding.
 */
export function suggestName(
  currentName: string,
  entryDate: string,
  takenSequences: ReadonlySet<string>,
): string {
  const slug = currentName
    .replace(/\.md$/, "")
    // Drop any partial date/sequence prefix the author was reaching for, so
    // "2026-09-08-foo" suggests "2026-09-08-01-foo" rather than doubling up.
    .replace(/^\d{4}-\d{2}-\d{2}-(?:\d{2}-)?/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let n = 1;
  while (takenSequences.has(String(n).padStart(2, "0"))) n += 1;
  return `${entryDate}-${String(n).padStart(2, "0")}-${slug || "entry"}.md`;
}

/**
 * A link written relative to changelog.d/ rather than the repo root.
 *
 * Fragments live in changelog.d/ but compile into CHANGELOG.md at the repo
 * root, so `](../tools/foo.ts)` ends up pointing one level above the repo.
 * Easy to write, invisible once compiled. README.md is exempt : it is not
 * compiled anywhere, so its own `../` links are correct as written.
 */
export const ESCAPING_LINK_RE = /\]\((\.\.\/[^)]*)\)/g;

/** Every changelog.d-relative link in a fragment body, in source order. */
export function escapingLinksOf(contents: string): string[] {
  return [...contents.matchAll(ESCAPING_LINK_RE)].flatMap((m) => m[1] ?? []);
}
