# changelog.d

Per-PR changelog fragments. **Every branch that would previously hand-edit `CHANGELOG.md` adds a file here instead** — one new file per PR, never a touch to the shared `CHANGELOG.md`. That's the whole point: `CHANGELOG.md` is one shared file every agent used to append to, and with several branches in flight at once that top-of-file insertion point is a guaranteed, recurring merge conflict. A new file under `changelog.d/` can never conflict with another branch's new file.

## Adding an entry

Create `changelog.d/<branch-slug>.md` (slashes in the branch name become dashes — `feat/public-api-keys` → `feat-public-api-keys.md`) containing **exactly one entry**, same format as a `CHANGELOG.md` line:

```
- YYYY-MM-DD: <Module / area> — <concise summary>. <one paragraph of what changed and why, linking the key files>.
```

Same density/tone/house-style rules as before (see [CLAUDE.md](../CLAUDE.md) § CHANGELOG) — this only changes _where_ the entry lives until it's compiled, not how it's written.

## Compiling

`pnpm changelog:compile` ([tools/compile-changelog.ts](../tools/compile-changelog.ts)) reads every `*.md` file here (except this README), inserts each as a new line under `## [Unreleased]` in `CHANGELOG.md` (newest-dated first), and deletes the consumed fragment files. This runs **automatically in CI on every push to `develop`** ([.github/workflows/changelog-compile.yml](../.github/workflows/changelog-compile.yml)) — you don't need to run it by hand as part of a PR. It's idempotent and a no-op when this directory is empty (nothing to compile → nothing committed), so it's also safe to run manually if you want to see the result locally before merging.
