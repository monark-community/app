# changelog.d

**These fragments are the source of truth for the changelog. [CHANGELOG.md](../CHANGELOG.md) is a generated artifact — never edit it by hand.**

One file per entry. That inversion exists because several agents and contributors work this repo at once: everyone appending to one shared file collides on the same insertion point every time, while everyone adding their own new file never collides at all. A PR only ever adds a fragment ; `CHANGELOG.md` is rewritten by CI on `develop`, so no branch touches the compiled file and there is nothing to conflict over.

## Adding an entry

Create `changelog.d/YYYY-MM-DD-NN-<slug>.md` containing **exactly one entry**:

- `YYYY-MM-DD` — the entry's own date, the same one that opens the entry body below. The two **must** match ; `pnpm check:changelog` fails when they disagree, because a filename that claims a different day than the entry it holds silently misplaces it in the compiled order.
- `NN` — a two-digit within-day sequence. Take the next one free for that date: `ls changelog.d | grep ^2026-09-08` and add one. Nothing breaks if two branches land the same `NN` on the same day (the filename still breaks the tie deterministically), so don't rebase over it ; just pick a free one when you can see the others.
- `<slug>` — lowercase kebab-case, conventionally the branch name with `/` flattened to `-` (`feat/public-api-keys` → `feat-public-api-keys`).

So a fragment on branch `feat/public-api-keys`, first entry of the day:

```
changelog.d/2026-09-08-01-feat-public-api-keys.md
```

The prefix is not decoration. `CHANGELOG.md` is compiled in (date DESC, filename ASC) order, so an undated filename sorts by whatever its slug happens to start with and lands arbitrarily among that day's entries ; dating the file makes the compiled order match the order entries were actually written, and makes `ls changelog.d` readable as a timeline.

The file contains exactly one entry:

```
- YYYY-MM-DD: <Module / area> — <concise summary>. <one paragraph of what changed and why, linking the key files>.
```

Multi-line entries are fine — indent continuation lines by two spaces, as many existing entries do. Same density, tone, and house-style rules as always (see [CLAUDE.md](../CLAUDE.md) § CHANGELOG).

**Write file links relative to the repo root, not to this directory.** The entry is compiled into `CHANGELOG.md` at the root, so a link that looks right from `changelog.d/` (`../tools/foo.ts`) resolves one level _above_ the repo once compiled and breaks. Write `tools/foo.ts`, `CLAUDE.md`, `.github/workflows/ci.yml`. `pnpm changelog:compile` rejects a fragment containing a `](../…)` link rather than let a broken link through.

You do **not** need to run the compiler or commit `CHANGELOG.md` — CI does that after your PR merges. Committing a regenerated `CHANGELOG.md` in your PR would reintroduce exactly the conflicts this design removes.

## Files here

| File                      | Purpose                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `YYYY-MM-DD-NN-<slug>.md` | One changelog entry. Yours goes here, and so do the 411 historical entries extracted from the old hand-maintained `CHANGELOG.md` — same shape, one convention. |
| `_header.md`              | The static top of `CHANGELOG.md` (title, Keep a Changelog blurb, `## [Unreleased]`). Files starting with `_` are structure, not entries.                       |

## Checking

```bash
pnpm check:changelog            # every fragment's name
pnpm check:changelog <paths…>   # just these (what the pre-commit hook runs)
```

[tools/check-changelog.ts](../tools/check-changelog.ts) enforces the naming rule and that each filename's date matches its entry's date. It runs in two places, so a bad name never gets far:

- **On commit**, through `lint-staged` on any staged `changelog.d/*.md`. The commit is rejected and the error prints the exact `git mv` to fix it, with the next free `NN` already worked out.
- **In CI**, in the `repo-checks` job, which is the authoritative gate.

The rule itself lives in [tools/lib/changelog-naming.ts](../tools/lib/changelog-naming.ts) as pure functions, covered by [tools/tests/changelog-naming.test.ts](../tools/tests/changelog-naming.test.ts) (`pnpm test:tools`). That suite also asserts every committed fragment conforms, so the directory can't drift back.

## Compiling

```bash
pnpm changelog:compile          # rewrite CHANGELOG.md from every fragment
pnpm changelog:compile --check  # exit 1 if CHANGELOG.md is out of date
```

[tools/compile-changelog.ts](../tools/compile-changelog.ts) sorts by date descending, breaking ties on filename, and writes `_header.md` followed by every entry. It runs automatically on every push to `develop` ([.github/workflows/changelog-compile.yml](../.github/workflows/changelog-compile.yml)) and commits the result only when the output actually changed.
