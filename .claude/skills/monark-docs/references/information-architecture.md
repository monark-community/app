# Information architecture

Where every page lives, how folders are laid out, and how the current docs map onto the target structure.

## Contents

1. Source layout
2. The eight sections in detail
3. Placement: deciding where a page goes
4. Naming
5. Landing pages and the storyline
6. What is not published
7. Retired folders
8. Site sync

## 1. Source layout

```
docs/
  get-started/            _index.md + one tutorial per audience
  use/<area>/             _index.md + how-tos         (area = data, automations, assistant, account, …)
  administer/<area>/      _index.md + how-tos
  build/<area>/           _index.md + tutorials / how-tos
  reference/              one page per lookup topic (folders only when a topic has 4+ pages)
  concepts/               platform-overview.md first, then one page or folder per subsystem
  operate/                one runbook per operation (folders for multi-phase runbooks)
  decisions/              NNNN-slug.md, numbered in order of acceptance
  assets/                 figures, referenced as ../../assets/<file>.png

packages/<module>/docs/   same section folders, only the ones the module needs:
  use/                    → published at use/<module>/
  administer/             → administer/<module>/
  reference/              → reference/<module>/
  concepts/               → concepts/<module>/
  decisions/              → decisions/  (numbered in the shared sequence)
```

Extended modules keep their docs inside the package so removing the module removes its docs, but the published site merges them into the same sections as core. A reader looking for "how do I move a card" finds Kanban under **Use Monark** next to Data, not in a separate "Modules" tab. Whether a feature is core or extended is an engineering fact, not a reader category.

## 2. The eight sections in detail

### Get started (`get-started/`)

A short page that asks "who are you?" and four tutorials, one per audience. Each is a single guided path that ends with something working and links into the section that audience lives in.

| Page                                  | Audience   | Ends with                                                        | Hands off to       |
| ------------------------------------- | ---------- | ---------------------------------------------------------------- | ------------------ |
| `_index.md`                           | everyone   | picking a path                                                   | the four tutorials |
| `first-steps.md`                      | org member | signed in, found their way around, created and followed a record | Use Monark         |
| `set-up-your-organization.md`         | org admin  | invited a teammate, given them a role, created a data model      | Administer         |
| `set-up-a-development-environment.md` | developer  | app running locally, tests passing, first change visible         | Build on Monark    |
| `deploy-your-first-instance.md`       | operator   | staging instance live and smoke-tested                           | Operate            |

Get started is not a feature tour. Anything that isn't on the shortest path to the "ends with" column belongs elsewhere.

### Use Monark (`use/`)

How-tos for people using the app day to day. One folder per **product area as the user names it** (Data, Automations, Kanban, Calendar, Wiki, Assistant, Your account, Search and navigation). One page per job inside it.

- Title is the job: "Filter records", "Save a view", "Move a card to another column". Not the screen ("The records table") or the feature ("Saved views").
- Only what the reader does and what they see. No routes, role keys, package names, or internals.
- Anything an admin must set up first gets one line and a link to the Administer page ("Your admin decides which fields a model has; see [Create a data model]").

### Administer (`administer/`)

How-tos for org admins configuring Monark for others. Grouped by admin job, not by `/admin` tab:

- `people-and-access/`: invite and deactivate users, roles and permissions, restrict a record, require two-factor for admins
- `data-models/`: create a model, add and change fields, publish a public form, moderate a public board
- `integrations/`: webhooks, automation integrations (GitHub, Telegram, …), secrets, service accounts
- `organization/`: organization settings, files, achievements
- plus a reference page listing what only system administrators can do

### Build on Monark (`build/`)

For developers on either side of the platform boundary:

- `public-api/`: a tutorial ("Make your first API call") then how-tos (create a scoped key, page through results, handle rate limits). Endpoint lists, error codes and limits go to Reference.
- `webhooks/`: receive and verify deliveries.
- `agents-and-mcp/`: connect an agent through the OpenAPI spec or MCP server.
- `extend/`: how-tos for contributors extending the platform: add a module, add an automation node type, add a search source, register permissions/events/notifications/flags, change the schema. These replace the scattered "how do I" content in technical docs and complement `docs/agents/*` (repo conventions for agents, unpublished).

### Reference (`reference/`)

Dry, complete, scannable lookup. Tables over prose. No steps, no narrative, no "why".

Candidates: query syntax, field types, permissions catalog, domain events catalog, notification kinds, feature flags, keyboard shortcuts, public API endpoints, API errors and rate limits, environment variables, `pnpm` scripts, routes, module manifest (core vs extended).

Reference is the one section allowed to be long; length comes from completeness, never from explanation.

### Concepts (`concepts/`)

Explanation: what a subsystem is, how its parts fit, why it's shaped that way, and its known limits. Read once to build a mental model, not consulted mid-task.

- `platform-overview.md` is the start page: what Monark is, the core/extended split, a map of the subsystems with one line each and a link.
- `architecture/` is the **one** place for module system, boundaries, event bus, codegen, boot sequence, frontend shell. Today this is spread across `architecture/`, `platform-overview/2-architecture/` and `extensibility-contract/`; those merge here.
- One page or folder per subsystem: data models and queries, permissions (RBAC and record scopes), automation engine, identity and integration, secrets, chat agent, block editor, notifications, white-label branding.
- Extended modules: `packages/<m>/docs/concepts/`.

A concept page explains the decision as it stands. The history of how it was reached (options, prior art, phased plans) goes in Decisions.

### Operate (`operate/`)

Runbooks for whoever runs a Monark deployment: environments, deploy, multi-instance, white-label retargeting, social sign-in setup, account recovery, observability, CI, backing stores for webhook secrets. Each runbook is a numbered procedure with a verification step. A multi-phase runbook is a folder with one page per phase, but only when each phase is done in a separate sitting; otherwise it's one page with `##` per phase.

### Decisions (`decisions/`)

Architecture decision records: one decision per file, `NNNN-short-slug.md`, never rewritten after acceptance (supersede with a new record instead). The number is the next free one across `docs/decisions/` and every `packages/*/docs/decisions/` (one shared sequence); add the record to `docs/decisions/_index.md` too.

Plans, follow-up lists, "not yet / deferred" lists and test plans are **not** decisions and are not published: move them to `docs/features-planning/` or `docs/todo/backlog.md`.

## 3. Placement: deciding where a page goes

Ask in order; stop at the first yes.

1. Is it a plan, a backlog item, or unbuilt? → not published (`features-planning/`, `todo/`).
2. Is it a guided first experience for a whole audience? → **Get started**.
3. Is it something you look up, not read through (a table of values, a syntax, a catalog)? → **Reference**.
4. Does it record why an option was chosen over alternatives, at a point in time? → **Decisions**.
5. Does it explain how something works without asking the reader to do anything? → **Concepts**.
6. Is it a procedure? Who performs it?
   - someone using the app for their own work → **Use**
   - an org admin configuring the app for others → **Administer**
   - a developer integrating with or extending the code → **Build**
   - someone running or deploying an instance → **Operate**

A page that answers yes to two questions is two pages. The usual case: a how-to with a big table in it → move the table to Reference and link it.

## 4. Naming

- **Files**: kebab-case slug of the title, no numeric prefixes (`filter-records.md`, not `31-filtering.md`). Order comes from `_index.md`, not filenames. Exception: decisions are `NNNN-slug.md`.
- **Folders**: short lowercase nouns from the reader's vocabulary (`data`, `people-and-access`), never package names (`data-models` is fine only because it's also the UI's name).
- **Titles**:
  - how-to: imperative verb + object, the job in the reader's words: "Filter records", "Invite a teammate", "Rotate a webhook secret".
  - tutorial: the outcome: "Make your first API call", "Set up a development environment".
  - reference: the thing: "Query syntax", "Permissions", "Environment variables".
  - concept: the noun phrase: "How automations run", "Identity and integration".
  - runbook: the operation: "Deploy to production", "Recover a locked-out admin".
  - decision: the decision as a statement: "Run chat tools in-process instead of through MCP".
- Never title a page with a fragment that only made sense under a parent heading ("Shape", "Pieces", "Tests", "Is it on?", "The 2x2").

## 5. Landing pages and the storyline

Every folder has an `_index.md`. It is the folder's front door **and** its running order: the site's sidebar follows the order of the links in its contents list.

A landing page has:

1. A one- or two-sentence intro: what this area is for, in the reader's words.
2. Any precondition that applies to every page in the folder (permission, feature enabled, admin setup), stated once here instead of on every page.
3. The contents list, **ordered as a reader meets the jobs** (first use → everyday → occasional → advanced), each link followed by a short clause saying when you'd need it.

```markdown
- [Filter records](filter-records.md): narrow a long list to the rows you care about.
```

Order is the storyline. Put the job a new reader needs first at the top, and the rare or advanced one last. The "Next" link at the bottom of each how-to follows the same order.

## 6. What is not published

`docs/features-planning/`, `docs/todo/`, `docs/archive/`, `docs/agents/`, and package `README.md` files are not on the site. Published pages may link to them (the sync turns the link into a GitHub URL), but should rarely need to: if a published page needs content from a README to make sense, that content belongs in Reference or Concepts.

Package READMEs stay the developer's API reference for that package (what's exported, data model, events). Concepts pages explain; READMEs enumerate. Don't copy one into the other.

## 7. Retired folders

`docs/user-guide/`, `docs/technical-documentation/` and `packages/<module>/docs/user-guide.md` were migrated into the eight sections on 2026-10-03 and no longer exist. The site no longer syncs them. Don't recreate them: a page that seems to belong there belongs in one of the sections above (use §3 to place it).

## 8. Site sync

`monark-community/app-docs` (`scripts/sync-docs.ts`, `MAPPINGS`) publishes the eight sections, each merged with its `packages/*/docs/<section>/` mirror, and `docs.config.ts` lists their header tabs. A new top-level section would need a mapping and a tab there. The `notify-docs.yml` workflow in this repo must list the same folders so a merge triggers a sync.
