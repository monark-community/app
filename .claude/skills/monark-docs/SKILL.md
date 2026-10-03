---
name: monark-docs
description: Write, restructure, and audit Monark documentation (the app user guide, extended-module guides, architecture and technical docs, runbooks, ADRs) so it reads as one organized, action-oriented docs site. Use this skill whenever you add, edit, move, split, merge, or review any Markdown under docs/ or packages/*/docs/, write a user guide or how-to for a feature you shipped, document architecture or a design decision, write a runbook, or when someone says the docs are wordy, badly organized, hard to follow, or need an audit, even if they don't name this skill.
---

# Monark docs

Monark's docs are published to docs.monark.io from this repo (`docs/` and `packages/*/docs/`, synced by `monark-community/app-docs`). This skill decides **where a page goes, what kind of page it is, and how it reads**. The goal is a site where every reader has a starting point, every page does one job, and every task page tells you what to do in the fewest words.

## The three rules everything else follows from

1. **One page, one type.** Each page is exactly one of: tutorial, how-to, reference, concept, runbook, decision, or landing. Mixing types is the main cause of long pages with no shape: a how-to that stops to explain architecture, a reference table buried in a narrative. When content belongs to another type, link to it (or create the page it belongs on).
2. **Organize by what the reader is trying to do, not by how the code is built.** Readers arrive with a job ("share a filtered list with my team", "deploy to staging"). Sections and page titles name jobs. Screens, packages, and module tiers are not categories.
3. **Every page knows what comes before and after it.** Landing pages define the running order of their folder; every tutorial and how-to ends with where to go next. That is the storyline.

## The site map

Eight top-level sections. Each is a folder under `docs/`; extended modules mirror them under `packages/<module>/docs/` so their docs still travel with the module.

| Section         | Folder         | Reader's question                         | Page types        |
| --------------- | -------------- | ----------------------------------------- | ----------------- |
| Get started     | `get-started/` | Where do I begin?                         | tutorial, landing |
| Use Monark      | `use/`         | How do I get this done in the app?        | how-to, landing   |
| Administer      | `administer/`  | How do I set this up for my organization? | how-to, landing   |
| Build on Monark | `build/`       | How do I integrate with or extend Monark? | tutorial, how-to  |
| Reference       | `reference/`   | What exactly is X? (lookup)               | reference         |
| Concepts        | `concepts/`    | How does it work, and why?                | concept           |
| Operate         | `operate/`     | How do I run, deploy, or recover it?      | runbook           |
| Decisions       | `decisions/`   | Why was it built this way?                | decision          |

Full placement rules, folder layout, naming, and the old→new migration map: **read [references/information-architecture.md](references/information-architecture.md) before creating, moving, or renaming any page.**

## Workflows

### Writing or updating a page

1. **Name the reader and the job.** One sentence: "An org member wants to see only the records assigned to them." If you can't write it, you don't know what page you're writing yet.
2. **Pick the type**, then the section from the table above. A page that seems to need two types is two pages.
3. **Check whether the page exists.** Search `docs/` and `packages/*/docs/` for the topic. Update and link rather than duplicating; one topic has one owner page.
4. **Ground every claim in shipped behaviour.** For UI labels, check `services/web/src/messages/en.json` (the source of every visible string) or the component itself; for behaviour, the code or the module README. Use the UI's exact label, in bold. If you can't verify a detail, describe it one level higher rather than invent it. Features behind an off-by-default flag that never ships, and anything in `docs/features-planning/`, stay out.
5. **Write from the template** for the type in [references/page-types.md](references/page-types.md). Stay inside its word budget.
6. **Edit with [references/style.md](references/style.md).** The cutting pass is not optional; first drafts here run 30–50% long.
7. **Wire it into the story**: add the page to its folder's `_index.md` contents list at the right position (that list _is_ the sidebar order), add a "Next" link on the page before it, and link related reference/concept pages.
8. **Run the linter**: `node .claude/skills/monark-docs/scripts/docs-lint.mjs <changed files or folders>` and fix what it reports.

### Auditing docs

When asked to review or audit docs (a page, a folder, or everything), follow [references/audit.md](references/audit.md). It starts with `docs-lint.mjs --report`, then a reading pass, and produces a findings report plus a proposed table of contents. Audit before you restructure; agree the target outline with the user before moving files.

### Restructuring (moving, splitting, merging pages)

- **Split by job, never by heading.** A long guide splits into one page per task the reader performs, and each new page must stand alone: its own intro line, its own steps, its own "Next". Cutting a guide at every `##` produces fragment pages ("Not yet / deferred", "The 2x2") that mean nothing in a sidebar. That is the failure this skill exists to undo.
- **Merge fragments** under ~80 words into the page that owns their topic, unless they are a complete answer to a real question.
- Moving a page means: update every inbound link (`grep -r "old-name.md" docs packages`), the old and new folders' `_index.md`, and leave no orphan.
- Do a whole area at a time (e.g. all of `use/data/`), so readers never see half old and half new structure inside one section.

## Before you finish

- [ ] Each touched page has exactly one type, declared in frontmatter (`type: how-to`).
- [ ] Titles name the reader's job (how-to: imperative verb; concept: the noun; reference: the thing looked up).
- [ ] The page sits in the section the IA table gives for its type and audience.
- [ ] Every UI label was checked against `en.json` or the component.
- [ ] It's within the word budget, and the style pass is done.
- [ ] It's in its folder's `_index.md`, and its neighbours link to it.
- [ ] `docs-lint.mjs` reports nothing for the touched files.
- [ ] If you added, moved, or removed a page in a published section, a CHANGELOG fragment says so (for doc-only work, one line is enough).
