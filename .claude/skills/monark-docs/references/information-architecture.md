# Information architecture

Where every page lives, how folders are laid out, and how the current docs map onto the target structure.

## Contents

1. Source layout
2. The eight sections in detail
3. Placement: deciding where a page goes
4. Naming
5. Landing pages and the storyline
6. What is not published
7. Migration map (old → new)
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

Architecture decision records: one decision per file, `NNNN-short-slug.md`, never rewritten after acceptance (supersede with a new record instead). Today's candidates: automation data flow, in-process chat tools vs a self-hosted MCP server, adjacency-list wiki tree, raw-SQL query compiler, durable outbox for automation, secrets as the credential substrate.

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

## 7. Migration map (old → new)

Migrate one area per PR. The legacy folders keep syncing until they are empty, so the site never breaks mid-migration.

### `docs/user-guide/`

| Old                                        | New                                                                                                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_index.md`                                | split: `get-started/_index.md` + `use/_index.md` + `administer/_index.md`                                                                                                                                                        |
| `navigation/*`                             | `get-started/first-steps.md` (finding your way around) + `use/search-and-navigation/` (search, shortcuts) + `reference/keyboard-shortcuts.md`; "routes worth knowing" → drop or `reference/routes.md`                            |
| `account/*`                                | `use/account/` (sign in, reset password, two-factor, notification preferences, API keys, delete your account); "after-hours edge cases" folds into the pages each case belongs to                                                |
| `data/*`                                   | `use/data/` (pilot: see `docs/use/data/`) + `reference/query-syntax.md`                                                                                                                                                          |
| `automations.md`, `automation-variables/*` | `use/automations/` one how-to per job (build a flow, choose a trigger, use values from earlier steps, test a flow, read run history) + `reference/automation-nodes.md` + `concepts/automations.md` (runs as owner, retries)      |
| `assistant.md`                             | `use/assistant/`                                                                                                                                                                                                                 |
| `achievements.md`                          | `use/achievements.md`; admin side → `administer/organization/`                                                                                                                                                                   |
| `admin/*`                                  | `administer/` per §2; `a-note-on-tenancy`/`one-organization` → `concepts/platform-overview.md`; `what-admins-cant-do-today` → `reference/system-administrator-actions.md`; `reaching-admin` → one line on `administer/_index.md` |
| `admin/webhooks/*`                         | `administer/integrations/webhooks.md` (create, edit, routing, auto-disable as `##` tasks) + `build/webhooks/verify-signatures.md` + delivery history in the same admin page                                                      |
| `public-api/*`                             | `build/public-api/` (tutorial + how-tos) + `reference/public-api.md` (endpoints, errors, rate limits)                                                                                                                            |

### `packages/<module>/docs/user-guide.md`

Split into `packages/<module>/docs/use/` how-tos (pilot: Kanban). Developer detail at the top of today's guides ("lives with the package on purpose") is removed; it belongs in the README.

### `docs/technical-documentation/`

| Old                                                                                                                    | New                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `platform-overview/_index`, `1-tech-stack`, `4-extensions`, `5-reference`                                              | `concepts/platform-overview.md` (+ `reference/tech-stack.md`, `reference/modules.md`)                                                                                          |
| `platform-overview/2-architecture/*`, `architecture/*`, `extensibility-contract/*`                                     | merge into `concepts/architecture/` (concept) + `build/extend/` (the how-to parts) + `reference/` (scripts, codegen commands, boot order)                                      |
| `platform-overview/3-core-capabilities/*`                                                                              | one `concepts/<subsystem>.md` each, merged with the matching deep-dive below                                                                                                   |
| `automation/*`                                                                                                         | `concepts/automations/` + `build/extend/add-an-automation-node.md`                                                                                                             |
| `automation-data-flow/*`                                                                                               | `decisions/NNNN-automation-data-flow.md` (one record; `phased-implementation` → features-planning)                                                                             |
| `chat-agent/*`                                                                                                         | `concepts/chat-agent.md` + `decisions/` for "in-process tools, not MCP" and "injection, not a dependency"; `not-yet-deferred` → backlog                                        |
| `data-model-queries/*`, `record-scopes.md`                                                                             | `concepts/data-models-and-queries.md` + `reference/query-syntax.md` + `decisions/NNNN-raw-sql-query-compiler.md`; `tests`, `feature-flag`, `deferred` fold in or go to backlog |
| `identity-and-integration/*`, `secrets/*`, `webhook-secret-resolver/*`                                                 | `concepts/identity-and-integration.md`, `concepts/secrets.md`, `operate/choose-a-webhook-secret-store.md`; `known-gaps` → backlog                                              |
| `kanban/*`, `wiki/*`                                                                                                   | `packages/<m>/docs/concepts/` (+ decisions such as the adjacency-list tree)                                                                                                    |
| `block-editor.md`, `files.md`, `achievements.md`, `observability.md`                                                   | `concepts/` (observability setup → `operate/`)                                                                                                                                 |
| `development/*`                                                                                                        | `get-started/set-up-a-development-environment.md` + `reference/scripts.md` + `build/extend/change-the-database-schema.md`                                                      |
| `test-plan/*`                                                                                                          | `build/extend/write-tests.md` (how-to) + `reference/test-layers.md`; the plan itself → features-planning                                                                       |
| `ci/*`                                                                                                                 | `operate/ci.md` + `reference/ci-jobs.md`                                                                                                                                       |
| `deploy-checklist/*`, `environments/*`, `multi-instance/*`, `white-label/*`, `social-sign-in.md`, `account-recovery/*` | `operate/` runbooks (deploy checklist stays a folder: its phases are separate sittings)                                                                                        |

## 8. Site sync

`monark-community/app-docs` (`scripts/sync-docs.ts`, `MAPPINGS`) decides which folders publish and as which section, and `docs.config.ts` lists the header tabs. When a new top-level section gets its first pages, add its mapping (core folder plus the `packages/*/docs/<section>/` mirror) and its tab there. The `notify-docs.yml` workflow in this repo must list the same folders so a merge triggers a sync.
