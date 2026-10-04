# Auditing docs

An audit answers three questions: is each page the right type in the right place, does the set tell a story, and does each page read well. It ends with a findings report and a proposed table of contents, never with files moved. Restructuring starts only after the user agrees the target outline.

## 1. Measure

```sh
node .claude/skills/monark-docs/scripts/docs-lint.mjs --report            # everything published
node .claude/skills/monark-docs/scripts/docs-lint.mjs docs/use/data       # one area, per-file findings
```

The report gives pages, words, untyped pages, fragments and finding counts per folder. Use it to pick where to read first: folders with many fragments, high averages, or high finding counts.

Also check history: `git log --oneline -- <folder>` often explains a structural problem (a mechanical split, a bulk import) faster than reading.

## 2. Classify

For each page in scope, record in a table:

| Page | Reader | Job | Actual type(s) | Target type | Target location |
| ---- | ------ | --- | -------------- | ----------- | --------------- |

"Actual types" is what the page does today, often more than one (a how-to with a reference table and a concept aside). Every page with two or more actual types is a split candidate; every page whose job duplicates another's is a merge candidate.

## 3. Read for the story

- Is there a start? Can each audience (member, admin, developer, operator) tell from the landing page where to begin?
- Do the folder contents lists run in the order a reader meets the jobs?
- Can a reader get from any how-to to the next likely job, and to the concept behind it?
- Are categories named for readers' jobs, or for screens and packages?

## 4. Read for quality

Sample at least three pages per area, including the longest. For each, apply the cutting pass in `style.md` mentally and estimate how much would go. Note concrete examples (quote them): they make the report convincing and become the before/after for the rewrite.

Check accuracy on a sample: pick five UI labels from the pages and look them up in `services/web/src/messages/en.json`. Drift is common (docs naming a label the UI no longer uses).

## 5. Report

```markdown
# Docs audit: <scope> (<date>)

## Summary

<3–5 sentences: the state, the main root causes, the recommended plan.>

## Findings by root cause

### <Root cause 1>

<What, evidence (page names, numbers, quotes), effect on the reader.>

## Proposed table of contents

<The target tree for the scope, as nested lists with page titles and types.>

## Migration plan

<Ordered PR-sized steps, one area each, with the pilot first.>
```

Lead with root causes, not with a list of every page's problems. "The guide was split mechanically at headings" explains forty bad pages in one line.
