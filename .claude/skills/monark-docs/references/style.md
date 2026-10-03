# Style

How Monark docs read. The short version: say what to do, in the words on the screen, then stop.

## Voice

- Second person, present tense, active voice. "Click **Save**." Not "The Save button can be clicked" or "Users can save".
- Plain words. "Use", not "leverage"; "lets you", not "enables the ability to".
- Confident about shipped behaviour. No "should", "might", "typically" about what the app does; it either does it or the sentence goes.
- Contractions are fine (you're, don't, it's).

## Punctuation (house style)

- No em-dashes anywhere. Prefer two short sentences; use `;` only when two clauses really belong together, and a colon to introduce a list or an explanation.
- Bold is for **exact UI labels** the reader looks for on screen, and nothing else. Not for emphasis, not for terms.
- Code font is for things the reader types or copies: query text, commands, URLs, keys. Not for UI labels or product nouns.

## Vocabulary

- **Use the UI's label exactly**, checked in `services/web/src/messages/en.json`. If the button says **Card limit**, the docs say card limit, not "WIP limit". If the menu says **Follow this list**, don't write "Follow the model".
- **Use the user's nouns**, not the schema's: record, model, board, card, flow, view. Never `DataRecord`, `tRPC`, `ADMIN`, `org-tier`, permission slugs, flag keys, package names, or file paths in Use and Administer pages.
- **One term per thing**, across the whole site. Pick the UI's term and stick to it ("flow" vs "automation" vs "workflow": use what the UI uses in that context).

## Gating

State a precondition once, as close to the top as possible, in the reader's terms. If it applies to the whole folder, state it once on the landing page instead of on every page.

| Gate         | Write                                                                                                    | Don't write                            |
| ------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| feature flag | "If you don't see **Kanban** in the navigation, it isn't enabled for your organization; ask your admin." | "Behind the `kanban.enabled` flag."    |
| permission   | "You need permission to edit records in this model."                                                     | "Requires `data-models.record-write`." |
| admin-only   | "Admins only."                                                                                           | "ADMIN / SYSADMIN role."               |

## The cutting pass

Do this on every draft. Most first drafts lose a third.

1. **Delete the throat-clearing.** Openers that announce the page instead of starting it.
   - ✗ "This page covers building and running a flow; for the details of passing values between steps, see …"
   - ✓ Start with the first useful sentence. Put "see also" links at the bottom.
2. **Delete provenance and disclaimers** that every page could carry: "It describes shipped behavior only", "Where this doc and the README disagree…", "It lives with the package on purpose". The site's rules apply to every page; they don't need restating.
3. **Delete meta-commentary.** "Nothing explained how they compose. That is what this doc is for." → cut. "Four things that are true and not obvious" → just state the four things.
4. **Turn descriptions into steps.**
   - ✗ "Once you've built a filter you like, save it as a **view** (the views menu). A view is a named filter for that model."
   - ✓ "1. Open **Views** and choose **Save current query…** 2. Name the view and click **Save**."
5. **Cut screen tours.** "Top to bottom: brand mark, destination icons, admin pin…" is only worth keeping if a step sends the reader there. Usually one sentence of orientation is enough ("Each area of the app has an icon in the navigation rail on the left").
6. **Cut implementation detail from user pages.** Routes (`/account/danger`), how retries work, which service runs it. If it changes what the reader does, translate it ("Failed runs retry a few times before they're marked failed" is fine; the outbox is not).
7. **Collapse parentheticals.** "(a sidebar on wide screens, a tab strip on narrow ones)" → keep only if a step needs it; on mobile-specific steps, say it once.
8. **One idea per sentence, ~20 words max.** A sentence with three `;` is three sentences, or a list.
9. **Lists only for parallel items.** Steps are numbered; options are bullets; a single item is a sentence.

## Before / after (from the current docs)

**Before** (`user-guide/data/bulk-edit.md`, a fragment page):

> Select several rows with their checkboxes to get a bulk-edit bar, then set a field's value across all of them at once ; handy for re-assigning or re-statusing a batch of records.

**After** (`use/data/edit-many-records-at-once.md`):

> Set one field to the same value on several records in one go, for example to reassign a batch.
>
> 1. Tick the checkbox on each record you want to change. A bar appears with the count selected.
> 2. Click **Edit field**, then choose the field.
> 3. Enter the new value and click **Apply to N records**.
>
> If the records currently hold different values for that field, you're warned first; applying overwrites all of them.

**Before** (`technical-documentation/identity-and-integration/_index.md`):

> Four primitives let Monark talk to the outside world and let the outside world talk back. Each is documented on its own (or, in three of the four cases, was not documented at all before this file), but nothing explained how they **compose**. That is what this doc is for. It describes shipped behavior only.

**After**:

> Webhooks, secrets, API keys and service accounts are how Monark exchanges data with other systems. This page explains how they fit together.

## Figures

- Use a screenshot when the reader must find something visually (a layout, an icon); not to decorate.
- Alt text says what the reader should notice, in one sentence.
- Store in `docs/assets/`; regenerate with `pnpm screenshots` where the harness covers the screen.
