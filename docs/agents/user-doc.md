# User-documentation guidelines

Practical rules for writing and maintaining the **user guide** ([docs/user-guide/](../user-guide/) + each extended module's `docs/user-guide.md`), for agents and humans. Read this before you add or edit any user-facing doc page. The goal: pages that are **accurate to shipped behaviour**, written **for the person using the app** (not the developer), and **consistent** across the whole guide.

This is about _user_ docs. For developer references (module READMEs, `technical-documentation/`) the audience and rules are different. For which strings get translated, see [i18n.md](i18n.md) — the user guide itself is English prose, not a translated artifact.

## TL;DR

- **Write for the user, not the developer.** No code, no repo file paths, no tRPC / Prisma / event-bus / package names. Describe what you _click_ and what _happens_.
- **Ground every statement in a real, shipped affordance.** Verify against the running app (or the web components / module README) before you describe a screen. Never invent UI. Unsure of an exact label? Describe the capability a notch higher rather than fabricate a button.
- **Document shipped behaviour only** — same rule as the READMEs (as-built). Roadmap / unbuilt features belong in `features-planning/`, not here.
- **Flag it when a surface is gated.** "where the feature is enabled" for feature flags ; "depends on your role" / "where your role permits" for permissions.
- **Placement follows the module tier.** Core-module surfaces → `docs/user-guide/`. **Extended**-module surfaces → `packages/<module>/docs/user-guide.md` (travels with the module), linked from the index under "Extensions".
- **House voice:** second person, present tense, active voice ; join clauses with `;`, no em-dashes ; match the UI's own vocabulary.
- **Cross-link, don't duplicate.** Point at the page that owns a topic.

## Audience & altitude

The reader is someone _using_ Monark, not building it. Keep everything at the altitude of the interface.

| Do                                                         | Don't                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| "Click **New**. A form opens with one input per field."    | "Calls `records.create` on the `dataModels` tRPC router."                             |
| "Reach it from the **Data** entry in the navigation rail." | "The route is `services/web/src/app/(authed)/data/…`."                                |
| "You're notified in-app when a record you follow changes." | "The `record-watch-subscriber` fans out a `data-models.record-changed` notification." |
| "Some events appear automatically from your data."         | "A `DataModelIntegration` maps a `DATE` field onto the calendar's `time` slot."       |

Name things the way the UI names them (records, boards, flows, cards, columns). Explain a _why_ only when it helps the user ("the WIP limit warns, it doesn't block you"). No internal identifiers, no permission-key strings, no schema.

## Accuracy & grounding

A user doc that describes a button that isn't there is worse than no doc. Before writing a surface:

- **Confirm it exists and how it behaves** — run the app, or read the wired web components (`services/web/src/app/(authed)/<area>/`) and the module's `README.md`. The [platform-overview](../technical-documentation/platform-overview/_index.md) and per-module READMEs are the authoritative behaviour references ; the user page is their user-facing translation.
- **Shipped only.** If it's behind an off-by-default flag that never ships, or it's a `features-planning/proposed/` idea, it doesn't go in the guide.
- When you can't verify an exact label or micro-flow, **raise the altitude** ("open the card to edit it") instead of inventing specifics ("click the pencil icon in the top-right").

## Structure of a page

Order sections the way most people meet the feature, top to bottom. A page usually reads:

1. **One-paragraph intro** — what this is, in the user's terms, and **how to reach it** (which nav entry / URL). Note any gating up front.
2. **One `##` section per task or surface** — finding things, creating, editing, filtering, sharing, notifications, etc. Scannable headings so a reader jumps straight to their question.
3. **Permissions / notifications notes** where relevant, usually near the end.

Keep it concise. Prefer short paragraphs and tight bullet lists over walls of prose. A returning user is scanning for one answer.

## Gating & permissions

Monark surfaces appear conditionally, and the guide must say so or it will describe things a reader can't find:

- **Feature flags** — "visible where the feature is enabled", "where the query feature is on". Don't name the flag key.
- **Permissions / roles** — "what you can do depends on your role", "where your role permits", "admins always see every record". Don't name the permission slug.

## Placement — core vs extended

The tier a module ships in decides where its user doc lives (mirrors how the code is isolated):

- **Core module** → a page in `docs/user-guide/` (e.g. `data.md`, `automations.md`, `account.md`, `admin.md`).
- **Extended module** → `packages/<module>/docs/user-guide.md`, so removing the module removes its docs (e.g. `@monark/calendar`, `@monark/kanban`). Wire it up:
  - Link it from [docs/user-guide/\_index.md](../user-guide/_index.md) under **Extensions**.
  - Add a one-line **User guide:** pointer at the top of the module `README.md` (dev vs. user docs stay clearly separated).

When you add or move a page, update `_index.md` so the index stays complete.

## House voice & mechanics

- **Person / tense:** second person, present tense, active voice. "Click Save." not "The Save button can be clicked."
- **Punctuation:** join clauses with `;` ; no em-dashes (matches the repo prose style).
- **Vocabulary:** use the product's and the UI's own terms consistently ; bold the literal labels users look for (**New**, **Run now**, **Follow**).
- **Links:** relative-link to sibling pages and to specific sections (`account.md#notifications`, `admin.md#secrets`) instead of repeating their content.
- **Keyboard / touch:** mention real shortcuts (⌘K / Ctrl-K) and touch behaviour where they exist.

## What NOT to document here

- Operator-only bootstrap surfaces (`pnpm provision:org`, `pnpm preflight`) and any dev-only surface (dev overlay, console) — those are internal.
- Anything in `features-planning/` — those are roadmaps, not shipped behaviour.
- Internal architecture, APIs, or data models — that's `technical-documentation/` and the module READMEs.

State these exclusions in a page's "What's _not_ documented here" note when useful (see `_index.md`).

## Keeping it current

The user guide reflects **as-built** behaviour, like the READMEs. When a feature's UI changes, update its user page in the same pass — a stale user doc (e.g. "the top bar has a hamburger" after the shell became a nav rail) actively misleads. If you can't verify a page against the current app, say so rather than leave a confidently-wrong description standing.
