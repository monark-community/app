# changelog.d

**These fragments are the source of truth for the changelog. [CHANGELOG.md](../CHANGELOG.md) is a generated artifact — never edit it by hand.**

One file per entry. That inversion exists because several agents and contributors work this repo at once: everyone appending to one shared file collides on the same insertion point every time, while everyone adding their own new file never collides at all. A PR only ever adds a fragment ; `CHANGELOG.md` is rewritten by CI on `develop`, so no branch touches the compiled file and there is nothing to conflict over.

## Adding an entry

Create `changelog.d/<slug>.md` (the branch name makes a good slug — `feat/public-api-keys` → `feat-public-api-keys.md`) containing **exactly one entry**:

```
- YYYY-MM-DD: <Module / area> — <concise summary>. <one paragraph of what changed and why, linking the key files>.
```

Multi-line entries are fine — indent continuation lines by two spaces, as many existing entries do. Same density, tone, and house-style rules as always (see [CLAUDE.md](../CLAUDE.md) § CHANGELOG).

**Write file links relative to the repo root, not to this directory.** The entry is compiled into `CHANGELOG.md` at the root, so a link that looks right from `changelog.d/` (`../tools/foo.ts`) resolves one level _above_ the repo once compiled and breaks. Write `tools/foo.ts`, `CLAUDE.md`, `.github/workflows/ci.yml`. `pnpm changelog:compile` rejects a fragment containing a `](../…)` link rather than let a broken link through.

You do **not** need to run the compiler or commit `CHANGELOG.md` — CI does that after your PR merges. Committing a regenerated `CHANGELOG.md` in your PR would reintroduce exactly the conflicts this design removes.

## Files here

| File | Purpose |
| --- | --- |
| `<slug>.md` | One changelog entry. Yours goes here. |
| `YYYY-MM-DD-NN-<slug>.md` | The 411 historical entries, extracted from the old hand-maintained `CHANGELOG.md`. The `NN` preserves their original within-day ordering. |
| `_header.md` | The static top of `CHANGELOG.md` (title, Keep a Changelog blurb, `## [Unreleased]`). Files starting with `_` are structure, not entries. |

## Compiling

```bash
pnpm changelog:compile          # rewrite CHANGELOG.md from every fragment
pnpm changelog:compile --check  # exit 1 if CHANGELOG.md is out of date
```

[tools/compile-changelog.ts](../tools/compile-changelog.ts) sorts by date descending, breaking ties on filename, and writes `_header.md` followed by every entry. It runs automatically on every push to `develop` ([.github/workflows/changelog-compile.yml](../.github/workflows/changelog-compile.yml)) and commits the result only when the output actually changed.
