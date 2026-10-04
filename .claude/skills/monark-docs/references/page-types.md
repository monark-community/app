# Page types

Seven types. Each has one job, a template, and a word budget (body words, excluding code blocks and tables). A page over budget is usually two pages or carries text that belongs on another type.

| Type      | Job                                           | Budget                                           | Lives in                   |
| --------- | --------------------------------------------- | ------------------------------------------------ | -------------------------- |
| tutorial  | take a newcomer from zero to a working result | 400–900                                          | get-started, build         |
| how-to    | get one job done                              | 80–350                                           | use, administer, build     |
| reference | let someone look up a fact                    | no cap; no prose beyond one intro line per table | reference                  |
| concept   | build a mental model                          | 300–900                                          | concepts                   |
| runbook   | perform an operation safely                   | 150–700 per page                                 | operate                    |
| decision  | record why an option was chosen               | 150–800                                          | decisions                  |
| landing   | orient and order a folder                     | 40–200                                           | every folder's `_index.md` |

Every page starts with frontmatter declaring its type; the linter reads it.

```markdown
---
type: how-to
---
```

---

## How-to

The workhorse. Most of Use and Administer is how-tos.

```markdown
---
type: how-to
---

# <Verb> <object>

<One sentence: what this gets you, in the reader's words. Only if needed, a second
sentence with the precondition: "You need permission to edit records in the model.">

1. <Action, starting with a verb. Bold the exact UI label: Click **New {model}**.>
2. <Next action.> <Optional: what you see as a result, when it confirms you're on track.>
3. …

<Optional, only if the job has a real variant:>

## <Variant as a job, e.g. "Restrict to specific roles">

1. …

<Optional: one short "Good to know" list, max 3 bullets, for behaviour that would
otherwise surprise the reader. Not for features the page didn't ask about.>

Next: [<the next job in the folder's order>](<page>.md)
```

Rules:

- **Steps are numbered and start with a verb.** One action per step. A result clause is allowed when it helps the reader confirm progress ("The record opens in a side panel.").
- **No section titled "Overview", "Introduction", or "About".** The first sentence is the overview.
- **No description of the screen** beyond what a step needs. "The title column is pinned on the left" is not a step; drop it unless a step depends on it.
- **No exhaustive option lists.** If the reader needs every option (every field type, every operator), link to Reference.
- **One job per page.** "Create and edit records" is two jobs only if they're done in different places or by different people; if it's the same form, it's one page titled for the job readers search for.

## Tutorial

```markdown
---
type: tutorial
---

# <Outcome: "Make your first API call">

<One paragraph: what you'll have at the end, who this is for, and how long it takes.>

## Before you start

- <prerequisite, with a link to get it>

## <Step 1 as an outcome: "Create an API key">

<Numbered actions. Show what the reader should see.>

## <Step 2 …>

## What you built

<Two or three sentences recapping, then where to go next: links into the section
this audience lives in.>
```

Rules:

- **One path, no branches.** Choose sensible defaults for the reader; options go in how-tos.
- **Every step produces something visible.** If a step has no visible result, merge it with the next.
- **Don't explain while teaching.** One sentence of "why" at most per step; link to the concept page for more.

## Reference

```markdown
---
type: reference
---

# <The thing>

<One line: what this lists and where it applies.>

| <Term> | <What it does> | <Example> |
| ------ | -------------- | --------- |
| …      | …              | …         |
```

Rules:

- **Consistent, complete, and boring.** Same columns for every row; every item present.
- **Organized for lookup**: alphabetical, or by the category the reader looks things up by.
- **No instructions, no narrative.** Link to the how-to that uses the reference.
- Generated content (permissions, events, flags) should cite its source of truth so it can be regenerated: `<!-- source: packages/rbac/... -->`.

## Concept

```markdown
---
type: concept
---

# <Noun phrase: "How automations run">

<Two or three sentences: what this is and the one idea that makes the rest make sense.>

## <Part or idea 1>

<Short paragraphs. A diagram or table where structure matters more than prose.>

## <Part or idea 2>

## Limits

<What it doesn't do today, stated plainly. Only shipped facts; plans go to the backlog.>

## Related

- <links to reference, decisions, and the how-tos that use this>
```

Rules:

- **Lead with the model, not the history.** "Automations run on the server from a durable queue" before "In Phase 2 we…". History lives in Decisions.
- **Explain why in one sentence per decision**, then link to the decision record.
- **Diagrams beat prose** for anything with more than three moving parts. The site doesn't render Mermaid; use a PNG/SVG in `docs/assets/` or a plain-text diagram in a code block.
- **No code walkthroughs.** Name the package or file once so a developer can find it; the README enumerates the API.

## Runbook

````markdown
---
type: runbook
---

# <Operation: "Deploy to production">

<One sentence: when you'd run this.> <Time it takes and what it touches.>

## Before you start

- [ ] <access, credentials, tools; each checkable>

## Steps

1. <Action.>
   ```sh
   <exact command>
   ```
````

   <Expected output or state.>
2. …

## Verify

<How you know it worked: a command, a URL, a check.>

## If something goes wrong

| Symptom | Cause | Fix |
| ------- | ----- | --- |

````

Rules:
- **Exact commands, copy-pasteable.** Placeholders in `<angle-brackets>`, explained once.
- **Every step that changes state says how to check it.**
- **Troubleshooting by symptom**, as a table.

## Decision

```markdown
---
type: decision
status: accepted | superseded by NNNN
date: YYYY-MM-DD
---

# NNNN. <Decision as a statement>

## Context
<The problem and the forces at play. Three to six sentences.>

## Options
| Option | For | Against |
|---|---|---|

## Decision
<What was chosen, in one or two sentences, and the deciding reason.>

## Consequences
<What this makes easy, what it makes hard, what it commits us to.>
````

Rules:

- One decision per record. Prior-art surveys get one paragraph in Context, not their own page.
- Don't edit an accepted decision's substance. Write a new one and mark the old one superseded.

## Landing

```markdown
---
type: landing
---

# <Area in the reader's words: "Data">

<One or two sentences: what this area is for.> <Preconditions that apply to every page below.>

- [<Job>](<page>.md): <when you'd need it, a short clause>.
- …
```

Rules:

- **Order the list as the reader meets the jobs.** It is the sidebar order and the storyline.
- **Annotate every link.** A bare list of titles ("Records", "Access", "Bulk edit") gives the reader no way to choose.
- Nothing else. No feature descriptions, no "what's not documented here".
