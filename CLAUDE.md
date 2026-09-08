# Monark App — working agreement

Rules for every change in this monorepo. They encode conventions the codebase already follows ; the linked files are the source of truth when this doc and the code disagree.

Companion docs, read them before large work:

- [docs/technical-documentation/extensibility-contract.md](docs/technical-documentation/extensibility-contract.md) — the canonical "can a feature ship without touching core?" reference. Every integration point below is spelled out there in full.
- [docs/technical-documentation/architecture.md](docs/technical-documentation/architecture.md) — module system, boundaries, event bus, monorepo layout & tooling.
- [modules.manifest.ts](modules.manifest.ts) — the core / extended tier registry.

## Parallel work: worktrees, branches, PRs

Multiple agents work this repo at once. **Never work directly in a shared checkout** — start every task in its own git worktree, on its own branch, and land it as a PR into `develop`. That's the difference between conflicts discovered mid-edit (someone else's half-finished file, in your working tree, right now) and conflicts resolved once, small, at merge time.

- **Start in a worktree.** `claude --worktree <name>` (or `-w <name>`) creates an isolated worktree + branch and starts the session inside it — built into the CLI, no extra tooling needed. Plain `git worktree add ../<name> -b <branch> develop` works the same way if you're not launching through the CLI.
- **Commit and push as the agent, not the operator.** Every agent-authored commit and PR uses the dedicated `monark-agent` bot account, never the human operator's personal GitHub identity — that's the whole point of the machine-account attribution work (changelog `2026-08-16`): it lets agent PRs be reviewed and approved by a human instead of blocked as self-approval. [.github/CODEOWNERS](.github/CODEOWNERS) routes review away from the account, and [.github/workflows/agent-attribution.yml](.github/workflows/agent-attribution.yml) fails any PR opened by `monark-agent` that contains a commit authored by someone else — the exact failure mode of an agent silently falling back to the operator's stored credentials. Auth is the `MONARK_AGENT_TOKEN` env var (a GitHub PAT scoped to this repo, push + PR, no admin) — read it from the environment, never hardcode it, never log it, never let it land in a commit. Concretely, in your worktree:
  - `git config user.name "Chrysa"` and `git config user.email "317500139+monark-agent@users.noreply.github.com"` (local to the worktree, not `--global` — don't overwrite the operator's own config). That's the account's GitHub-issued noreply address ; it's what lets GitHub (and `agent-attribution.yml`) resolve the commit back to the `monark-agent` login.
  - Push over HTTPS with the token rather than the operator's SSH key: `git push https://x-access-token:$MONARK_AGENT_TOKEN@github.com/monark-community/app.git HEAD:<branch>` (or export `GH_TOKEN=$MONARK_AGENT_TOKEN` and use `gh` normally, which reads that variable automatically). Don't bake the token into `origin`'s URL — it would persist in `.git/config` on disk.
  - Opening the PR: `GH_TOKEN=$MONARK_AGENT_TOKEN gh pr create --base develop ...` if `gh` is installed ; otherwise call `POST /repos/monark-community/app/pulls` directly with the same bearer token, so the PR's `user.login` is `monark-agent` too, not just its commits.
  - **If `MONARK_AGENT_TOKEN` isn't set, stop and ask** — don't fall back to the operator's personal identity or an unauthenticated push just to make progress. A commit authored as the operator when it should have been the agent is exactly the mismatch `agent-attribution.yml` exists to catch, and it's better caught before a push than after.
- **Branch naming**: `<type>/<slug>`, using the [conventional-commit](https://www.conventionalcommits.org/en/v1.0.0) types: `feat/`, `fix/`, `docs/`, `test/`, `chore/`, plus `tooling/` for build and developer-tooling work. `feat/`, not `feature/`. One task, one branch ; rename a placeholder branch once the task is scoped.
- **`develop` is the integration branch** ; everything lands there by PR. `main` is the release branch, promoted from `develop` by the maintainers ; never PR or push to it directly. Same rule for outside contributors ([CONTRIBUTING.md](CONTRIBUTING.md)) ; keep the two docs in sync if this changes.
- **Commit small, commit often.** Isolation removes the reason to hoard changes into one giant commit — there's nothing to accidentally catch by committing early anymore. Commit at each coherent, gate-passing increment (a green test, a working slice), not just once at the end.
- **Open a PR, don't push to `develop` directly.** Draft PRs early are welcome — opening one as soon as the branch exists gives everyone else (human or agent) visibility into what's in flight, which is the cheapest way to avoid two agents building the same thing twice. `gh pr create --base develop`.
- **CI is the real gate.** Run the pre-PR gate locally in your own worktree before marking a PR ready (below), but CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) checking a clean, isolated checkout is the actual source of truth — not a local run against a tree other agents have also been touching. Branch protection requires exactly one context, `ci-ok` ; every leg of [.github/workflows/ci.yml](.github/workflows/ci.yml) fans into that job. Add a new leg to its `needs:` list and leave the ruleset alone ; adding a second required context strands every open PR whose branch predates it, because a run that never produced the check reports nothing and GitHub waits on it forever.
- **Known shared hotspots** still get touched by everyone regardless of isolation — [services/api/src/server.ts](services/api/src/server.ts)'s `register*` calls, [modules.manifest.ts](modules.manifest.ts), the i18n catalogs. Module-boundary discipline (`check:tiers`) keeps most other work file-disjoint. Small, frequent commits make a conflict on one of these trivial to resolve instead of a scramble.
- **CHANGELOG entries are fragments, not direct edits** — see § CHANGELOG below.

## Every feature must consider these four systems

When you add or change a feature, decide **explicitly** how it touches each of the following — and if the answer is "not at all", make that a conscious choice, not an oversight. Wire what applies at api boot in [services/api/src/server.ts](services/api/src/server.ts) next to the existing `register*` calls.

### 1. RBAC — [packages/rbac](packages/rbac/README.md)

Every write path gates through a capability, never an inline role-string comparison.

- Register the feature's permissions once at boot: `registerPermissions("<module>", { "<key>": { description, category } })`.
- Guard mutations at the top of the tRPC procedure: `const userId = await requirePermission(ctx, "<module>.<key>", orgId)`.
- Never write `role.key === "ADMIN"`. Built-in `ADMIN` (org-tier) and `SYSADMIN` (platform-tier) already short-circuit `hasPermission` to true, so a new permission is auto-granted to admins with no backfill.
- New permissions surface in `/admin/rbac` automatically once registered.

### 2. Event bus — [packages/common/src/events.ts](packages/common/src/events.ts)

The in-memory, best-effort domain bus. State-changing actions should emit a domain event so other modules (and webhooks) can react without coupling.

- Emit from the server action: `await emit({ type: "<module>.<thing>-happened", occurredAt: new Date(), ... })`.
- Declare the event on your module's `contracts/events.ts` as part of its `XxxEvents` union ; it joins the `DomainEvent` type union via `pnpm gen:events` once the module is in [modules.manifest.ts](modules.manifest.ts).
- Register the operator-facing description so it shows in the webhooks subscription picker: `registerEventTypes("<module>", { "<module>.<thing>-happened": { description } })` — see [packages/common/src/event-registry.ts](packages/common/src/event-registry.ts).
- The bus is in-memory only. If durability matters (audit, external integration), lean on `@monark/webhooks` (its wildcard subscriber persists every emit to an at-least-once outbox) rather than the bus alone.

### 3. Notifications — [packages/notifications](packages/notifications/README.md)

If a change should tell a user something (email or in-app), route it through the dispatch surface — never hand-roll mail.

- Type the payload by augmenting `NotificationDataRegistry` via declaration merging so `notify()` stays typed at call sites.
- Register the kind + en/fr templates at boot: `registerNotificationKind(kind, def, messages)`.
- Prefer emitting a domain event and adding a subscriber in [packages/notifications/src/server/subscribers](packages/notifications/src/server) over calling `notify()` inline ; call `notify()` directly only when the code path already holds the data and no event fits.
- Ship **both** locales (en + fr). Dispatch is best-effort and never throws ; `requiredEmail: true` is reserved for account-safety kinds.

### 4. Webhooks — [packages/webhooks](packages/webhooks/README.md)

Usually free: any registered domain event is subscribable by operators the moment it lands in the manifest and event-type registry (points 2 above). No webhook code change is needed for a new event — just make sure you completed the event-type registration.

### 5. Feature flags — [packages/feature-flags](packages/feature-flags/README.md)

If a feature ships incrementally, or wants an org / role / user / global kill-switch, gate it behind a flag rather than a deploy.

- Register once at boot: `registerFlags("<module>", { "<key>": { description, defaultOn } })`.
- Check at the call site with the dotted form: `isEnabled("<module>.<key>", { userId, organizationId })`.
- Overrides (org, role, user, global) resolve through the same path as core flags and surface in `/admin/feature-flags` automatically.

### Data that doesn't fit core — the metadata sidecar

Extended modules add their own relational tables in their **own fragment** `packages/<module>/prisma/<module>.prisma` (see boundaries below ; assembled into the generated `schema.prisma` by `pnpm gen:schema`), but when a feature needs per-user or per-org data but not indexed columns, use the sidecar instead of a migration: `setUserMetadataValue({ userId, module, key, value })` / `setOrganizationMetadataValue({ ... })`, identity `(parent_id, module, key)`, value is JSON. Gate reads / writes with the `users.read-metadata-for-module-<module>` / `write-…` permissions. Graduate to a per-module schema fragment only when you need to filter, sort, or FK on the value.

## Module boundaries

Two tiers, declared in [modules.manifest.ts](modules.manifest.ts) and enforced by `pnpm check:tiers` (a CI gate). **Core** modules ship with every deploy ; **extended** modules are business features on top. The walls, crossing one means the work should be a core change instead:

- Extended modules **MUST NOT** depend on another extended module. Compose via core packages, the event bus, or the metadata sidecar.
- Extended modules **MUST NOT** touch `base.prisma` (the core schema, owned by `@monark/db`) or the generated `schema.prisma`. A module that needs relational / indexed tables owns **its own fragment** `packages/<module>/prisma/<module>.prisma` under its `// ── MODULE: <name> ──` banner (as `@monark/calendar` / `@monark/kanban` do), which `pnpm gen:schema` assembles into `schema.prisma` ; it owns the migration. `pnpm check:tiers` rejects an extended-module banner found in `base.prisma`. For lightweight per-user / per-org data, prefer the metadata sidecar. (Core-model back-relations to a fragment's tables still live in `base.prisma` — full core↔extended FK decoupling is a tracked follow-up.)
- Extended modules **MUST NOT** mutate core registries directly — only call the `register*` APIs. Reaching into a registry's in-memory map bypasses validation and breaks boot ordering.
- Never rename or repurpose an existing domain event, flag, permission, or notification kind ; add new ones under your own module's namespace. Collisions across namespaces are a deploy-time error.

Full detail: [docs/technical-documentation/extensibility-contract.md](docs/technical-documentation/extensibility-contract.md).

## Codegen — never hand-edit generated files

Three artifacts are generated, not written: the `DomainEvent` union (`*.generated` under `contracts`), the tRPC app router, and the **Prisma schema** ([packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma)). They come from `pnpm gen` (= `pnpm gen:schema` + `pnpm gen:events` + `pnpm gen:routers`).

- After you touch a module's `contracts/events.ts` or its tRPC router, rerun `pnpm gen`.
- **`schema.prisma` is assembled** by `pnpm gen:schema` from [packages/db/prisma/base.prisma](packages/db/prisma/base.prisma) (datasource + generator + all **core** models) plus each module's own fragment ([packages/&lt;module&gt;/prisma/\*.prisma](packages/calendar/prisma/calendar.prisma)). Edit the **base or the fragment**, never `schema.prisma` ; rerun `pnpm gen` after a schema change, then `pnpm --filter @monark/db db:migrate:dev` for the migration.
- Never edit a `*.generated.ts` file or `schema.prisma` by hand — your change is overwritten on the next gen, and **CI fails on codegen drift**.
- New modules must be listed in [modules.manifest.ts](modules.manifest.ts) or `gen` won't pick them up.

## Scaffolding a new module

Use `pnpm gen:module` to create a module — don't hand-build the skeleton. It lays down the `contracts` / `server` / `client` layout with the correct `package.json`, `tsconfig.json`, and vitest config wired up, so the new package is consistent with the rest of `packages/*` from the first commit. Add it to [modules.manifest.ts](modules.manifest.ts) with its tier, then wire its `register*` helpers into [services/api/src/server.ts](services/api/src/server.ts). `pnpm check:modules` (a CI gate) then holds the module to the completeness contract — registered in the manifest, README + `contracts/events.ts` present, and a `tests/integration/` suite if it has a tRPC router. A conscious, temporary exception goes in `ACKNOWLEDGED_GAPS` in [tools/check-modules.ts](tools/check-modules.ts) ; the gate fails if that entry is left behind once the gap is closed.

## Strict TypeScript

[tsconfig.base.json](tsconfig.base.json) runs full `strict` plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `useUnknownInCatchVariables`. Hold the line:

- **No `any`.** Reach for `unknown` + narrowing, generics, or a precise type. No `@ts-ignore` / `@ts-expect-error` without a one-line justification comment.
- **No non-null `!` to silence `noUncheckedIndexedAccess`.** Handle the `undefined` an index access can return.
- Validate all external input (tRPC input, request bodies, env) with `zod` at the boundary ; types alone don't survive the network.
- Relative imports carry **no `.js` extension** (moduleResolution is `Bundler`).
- Cross-package imports use the `@monark/<pkg>/{server,client,contracts}` entry points, never deep-reach into another package's `src`.
- `pnpm tsc --noEmit` (or `pnpm gen && pnpm --filter <pkg> typecheck`) must pass before a change is done.

## List methods paginate

Every "GET ALL" is a **cursor-paginated** method first ; an unbounded `findMany` is the exception, justified in a comment. The shared convention lives in [packages/common/src/pagination.ts](packages/common/src/pagination.ts) : a list function takes `PaginationArgs` (`{ limit?, cursor? }`) and returns `Paginated<T>` (`{ items, nextCursor, total }`).

- Build the page with the helpers : `cursorFindArgs(limit, cursor)` spreads `take` / `cursor` / `skip` into the Prisma `findMany`, and `toPage(rows, total, limit)` slices the over-fetched row and derives `nextCursor`. Run a `db.X.count({ where })` on the **same** `where` alongside the page query (one extra count per fetch) so the UI can show "of {total}".
- Ordering must be stable and end in `id` (e.g. `orderBy: [{ updatedAt: "desc" }, { id: "desc" }]`) so the keyset cursor is deterministic.
- The tRPC procedure spreads the shared `limit` / `cursor` zod fields into its input (bounded by `MAX_PAGE_SIZE`) and passes them through.
- Reference : `listDataModels` / `listDataRecords` in [packages/data-models/src/server/data.ts](packages/data-models/src/server/data.ts). Consumers that genuinely need "all rows" (a filter dropdown) request an explicit high `limit` and read `.items` — they don't get a separate unbounded method.

## Loading states

Every meaningful component that fetches or awaits data ships a **layout-accurate skeleton** loading state — not a spinner, not a "Loading…" string, and not a bare fallback. Build it from the shared [`Skeleton`](services/web/src/components/ui/skeleton.tsx) primitive (`import { Skeleton } from "@/components/ui/skeleton"`).

- **Match the real layout.** The skeleton mirrors the loaded content's structure — same rows / columns / card shape, same approximate widths and heights — so nothing shifts when data arrives. A table renders skeleton rows with a cell per column (see the placeholder rows in [records-list.tsx](<services/web/src/app/(authed)/data/models/[modelKey]/records-list.tsx>)) ; a form or detail panel renders skeleton blocks where its fields land.
- **Cover every async surface**, including data behind a tRPC query, a Suspense boundary, or a route segment (`loading.tsx`). If a component has an `isLoading` / `isPending` branch, that branch is a skeleton.
- **"Meaningful" = the user waits on it.** Small, instant, or purely static components don't need one ; anything that renders after a fetch does.

## Shared UI patterns

Recurring list / detail-panel screens compose from the shared patterns in [services/web/src/components/patterns](services/web/src/components/patterns) — reach for these before re-pasting layout, so every admin screen reads and behaves the same. Import from the barrel: `import { FilterBar, TableDetailLayout, … } from "@/components/patterns"`.

- **`DataTable` + `useDataTableLayout` + `TableTools`** — the standard list surface (built on `@tanstack/react-table` + `@dnd-kit`), used by **every** list screen (admin included ; no hand-rolled `<ul>` card lists). `useDataTableLayout(storageKey)` owns the user-adjustable layout (column order / visibility / widths / multi-column sort) and persists it per-browser (localStorage) ; pass the same object to `<DataTable layout>` and `<TableTools layout>` so the toolbar controls drive the table (omit `layout` only for a toolbar-less embed — the table then manages it privately). The table itself renders rows only : headers still click-to-sort and drag-to-reorder in place, but the config UI (sorting editor, columns editor) lives in the toolbar, not in the table chrome. Every table has a mandatory **primary column** (first, pinned, never hidden/moved) with a main label + optional subtext + an optional **`leading`** slot (avatar / logo / status dot, so a row reads card-like) ; clicking **anywhere in the row** activates the primary column — opens the detail panel (via `href`, or `onSelect` when there is no route) — while real controls inside the row (the primary link, the `…` menu, inline links) keep their own click and a text-selection drag is left alone. Cells are read-only — no inline editing ; edits go through the detail panel's form. Per-row actions collapse into a single trailing `…` menu via `rowActions` (its button stops click propagation so it never triggers the row) — do not add multiple inline action buttons to a row. Pass already-translated `labels` + action labels (i18n stays with the caller). Opt into multi-row selection with the `selection` prop (`{ selectedIds, onSelectedIdsChange }`, transient — never persisted) : it adds a leading checkbox column (per-row + a header select-all) ; pair it with **`BulkEditBar`** for field-driven bulk edit — it renders a count + edit/clear bar when rows are selected, and an edit dialog that picks one of the passed `FieldDef`s and sets a single value across every selected row (warning first when the rows hold differing values). Bulk edit is field-agnostic (drives its value editor from the data model's own fields, excluding computed ones) and gated by its own `data-models.record-bulk-write` permission, separate from and additional to per-model `record-write` (`records.bulkUpdate`). See [records-list.tsx](<services/web/src/app/(authed)/data/models/[modelKey]/records-list.tsx>).
- **`usePaginatedList` + `DataTable pagination`** — cursor Prev/Next pagination, the default for every list table backed by a "GET ALL". `usePaginatedList({ resetKey })` owns the page size + a stack of visited cursors (Prev is a pop) and resets to page 1 when `resetKey` (the surrounding filters / search) changes ; feed `pagination.limit` / `pagination.cursor` into the tRPC query (with `placeholderData: keepPreviousData` for gap-free paging) and pass `pagination.getFooterProps(query.data, labels)` to `<DataTable pagination>`. The footer renders "Showing 1–25 of {total}", a page-size selector, and Prev / Next. Build `labels` with `usePaginationLabels()` (keeps the pattern text-free). See [records-list.tsx](<services/web/src/app/(authed)/data/models/[modelKey]/records-list.tsx>). A deep-linkable detail panel must fetch its record by id (`getById`), not search the current page — the selected row may have paged away (see [records-list.tsx](<services/web/src/app/(authed)/data/models/[modelKey]/records-list.tsx>)).
- **`FilterBar` + `FilterBarSearch` + `TableTools`** — the toolbar row above a table. `FilterBar` has three slots : `search` (left ; pair with `FilterBarSearch`, which fills the row on mobile and holds ~350px on desktop), `tools` (right-aligned, just left of the actions ; pair with `TableTools`), and `actions` for the primary CTA (right-most, never collapses). `TableTools` renders the list controls — a Filters menu (pass `FilterConfig[]`, same declarative union as before : `select` / `multiSelect` / `text` / `date`), a Sorting editor (priority list : drag to reprioritize, per-field direction toggle), and a Columns editor (drag-reorder + visibility, plus Reset layout). Trigger badges show the active filter / sort count. When the row gets tight the controls collapse right-to-left into a single sliders trigger opening a drill-in popover (`FilterBar` measures the row and exposes the budget via `useFilterBarToolsBudget` ; same fit logic as `PanelHeader`'s "…" overflow, shared in `patterns/overflow.ts`) ; on mobile they always collapse, into a full-screen dialog of labelled sections. Never scatter loose `Select`s across the toolbar.
- **`TableDetailLayout` + `useDetailPanelRoute`** — the table ↔ detail-panel combo. The hook keeps the selection in a `?<param>=` search param (deep-linkable, create = `?<param>=new`). On desktop the layout owns a persistent non-modal right-hand `Sheet`, keeps the table interactive behind it, and closes on Escape / outside-click (but not when clicking a row, a `…`/column menu, or a confirm dialog it spawned). On mobile the same panel goes full-screen and modal ; selecting a row (tap the primary label) takes over the screen. On desktop the panel's left edge is a **resize handle** ; the chosen width persists per screen, keyed by the `storageKey` prop (so e.g. two different list screens remember independent widths ; omit it to share one preference), with `panelClassName` as the default until dragged.
  List/detail sections open records **in the panel by default** (limit page-nav), keeping the full `[id]` page only as an "open full page" escape hatch — this is the house pattern for admin (organizations, users, rbac, webhooks) as well as the Data Models record browser. An editor rendered in the panel takes a `containment="container"` prop so it drops its `PageHeader`, anchors its save bar to the panel, and closes the panel on success instead of routing.
- **`PanelHeaderBar`** — the `h-14` panel controls bar (collapse + optional open-full-page), aligned to the appbar height. The open-full-page link is auto-hidden on mobile, where the panel is already full-screen.
- **`DirtyFormBar`** — the blessed save affordance for create/edit forms : a dirty-gated sticky "unsaved changes" banner (slides in only when the form differs from its loaded baseline ; Cancel **reverts** to baseline, delete lives in a `DangerCard`). `containment="viewport"` (default) pins it to the screen on full pages ; `containment="container"` anchors it to the bottom of a detail panel. Prefer this over the older `FormActionsFooter` (an always-visible inline button row, retained for the `@/components/fields` `AutoForm`).
- **`ConfirmDialog`** — controlled confirm dialog for delete / archive / destructive actions.

These are **app-local** on purpose (they encode routing, i18n, and RBAC-gated actions). Keep them text-free — pass already-translated labels in as props. The purely-presentational shells (`FilterBar`, `FormActionsFooter`) are candidates to graduate to `@monark/ui` only if a second surface needs them ; decide explicitly rather than pre-generalizing. See [records-list.tsx](<services/web/src/app/(authed)/data/models/[modelKey]/records-list.tsx>) and [data-models-list.tsx](<services/web/src/app/(authed)/admin/data-models/data-models-list.tsx>) for reference wiring.

## Navigation & global search

A module with a user-facing surface must make itself **reachable and searchable** — treat this as a default part of shipping a module, not an afterthought. Two registries:

- **Primary nav** (web) — [config/primary-nav.ts](services/web/src/config/primary-nav.ts). Add a `PrimaryNavEntry` (id, href, icon) for the module's top-level surface, plus its `appBar.primaryNav.items.<id>` label in en + fr. This drives the drawer **and** the command palette's "Go to" group, which derives its module destinations from `PRIMARY_NAV` (see [global-search/routes.ts](services/web/src/components/global-search/routes.ts)) — so a drawer entry is automatically searchable-by-name with no second edit.
- **Global-search source** (server) — `registerSearchSource(...)` from [@monark/common](packages/common/src/search-registry.ts), the same "register at boot, list at query time" pattern as event types / automation nodes. If the module owns searchable **entities** (records, cards, events, pages), register a source in its `/server` (a `registerXxxSearchSource()` wired in [services/api/src/server.ts](services/api/src/server.ts)). Its `run(ctx, query, limit)` reuses the module's data-layer search, **scopes itself** (its own `requireOrg` + `requirePermission` / accessible-id resolution — mirror `kanban`/`calendar`), and returns `SearchHit { id, title, subtitle?, icon?, href }` with the **href built server-side**. Add a `globalSearch.groups.<groupId>` heading (en + fr) + a `groupId → lucide` entry in the palette's icon map. The core `search.global` fan-out ([@monark/search](packages/search/README.md)) aggregates every source — so the module joins the **global** command palette automatically, with no web edit. (The old per-section `SearchProvider` web components were retired for this ; see [global-search.md](docs/features-planning/proposed/global-search.md).)

The nav entry costs one line and is effectively mandatory for any module with a page ; the search source is optional but expected whenever the module has entities worth jumping to.

## Per-module documentation

Each package owns a `README.md` following the shape already used across `packages/*` — see [packages/rbac/README.md](packages/rbac/README.md) and [packages/notifications/README.md](packages/notifications/README.md) as the template. When you add or change a module, update its README's relevant sections:

- **What's here** — the `/contracts`, `/server`, `/client` surface.
- **Key concepts** — the load-bearing design decisions.
- **Public API** — the exported functions / types table (this is the developer API doc).
- **Data model** — the Prisma models the module owns, under its `// ── MODULE: <name> ──` banner in its schema source ([base.prisma](packages/db/prisma/base.prisma) for core ; `packages/<module>/prisma/<module>.prisma` for extended), plus the migration id.
- **Events emitted / consumed** and **tRPC surface**.

Two documentation audiences, both required when the change reaches them:

- **User docs** — [docs/user-guide](docs/user-guide) for anything user-facing. No code, written for the person using the app. **Extended modules** keep their user guide _with the package_ (`packages/<module>/docs/user-guide.md`, as `@monark/calendar` and `@monark/kanban` do) so it travels with the module ; link it from the [user-guide index](docs/user-guide/_index.md) under "Extensions".
- **Developer docs** — [docs/technical-documentation](docs/technical-documentation) for internals (architecture, data models, extension points, runbooks). Add a new file per topic and cross-link ; update [docs/README.md](docs/README.md) if you add one.

All user-facing strings go through i18n in both `en` and `fr` — never hardcode visible text. `pnpm check:i18n` (a CI gate) enforces that every locale catalog under [services/web/src/messages](services/web/src/messages) carries the exact same key set as `en` ; add a key to one locale and you must add it to all. Before touching i18n keys, read [docs/agents/i18n.md](docs/agents/i18n.md) : what to translate vs. keep as canonical English registry strings (event / permission / flag / node descriptions are NOT localized), and the parity gate's blind spot (a key missing from _both_ locales still passes `check:i18n` but renders a raw key path at runtime).

## CHANGELOG

Every completed feature, foundation shift, or substantive fix gets one dated entry — added as a new file under [changelog.d/](changelog.d/README.md). **[CHANGELOG.md](CHANGELOG.md) is a generated artifact ; never edit it by hand.** The fragments are the source of truth: with several branches in flight, everyone editing the same insertion point in one shared file is a guaranteed merge conflict, while everyone adding their own new file isn't. `pnpm changelog:compile` ([tools/compile-changelog.ts](tools/compile-changelog.ts)) rebuilds `CHANGELOG.md` from every fragment (date descending) ; it runs automatically on every push to `develop` ([.github/workflows/changelog-compile.yml](.github/workflows/changelog-compile.yml)), so a PR only ever adds its fragment — don't run the compiler or commit the regenerated file yourself, that reintroduces the conflicts this removes.

Create `changelog.d/<branch-slug>.md` containing one entry:

```
- YYYY-MM-DD: <Module / area> — <concise summary>. <one paragraph of what changed and why, linking the key files>.
```

Match the existing entries' density and tone. Link the touched files with relative paths.

## Prose style

House style throughout docs, commits, READMEs, and CHANGELOG: use `;` rather than an em-dash to join clauses. No em-dashes in prose.

## Pre-PR gate

Run this in your own worktree (§ Parallel work above), not a shared checkout — a stale or half-edited file from another agent's session makes the result meaningless. Run the same sequence CI runs, in order, before a change is done:

```
pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers && pnpm check:modules && pnpm check:i18n && pnpm check:mcp
```

`pnpm gen` first so a stale generated file doesn't fail `typecheck` ; `check:tiers` confirms no boundary was crossed ; `check:modules` confirms every module is complete (registered in the manifest, README + `contracts/events.ts` present, integration suite present ; conscious exceptions live in `ACKNOWLEDGED_GAPS` in [tools/check-modules.ts](tools/check-modules.ts)) ; `check:i18n` confirms every locale catalog has the exact same key set as `en` (no missing or dead keys) ; `check:mcp` confirms every public-API route (`V1_ROUTES`) made an explicit MCP-visibility decision (`mcp: { expose } | { skip }`) and that exposed tool names are unique + well-formed — the MCP server auto-generates its tools from these, so an undecided route can't silently ship.

## Definition of done

- [ ] RBAC: write paths gated by a registered permission (or consciously N/A)
- [ ] Event bus: state changes emit a registered domain event (or consciously N/A)
- [ ] Notifications: user-facing signals go through `notify()` + a registered kind, en + fr (or consciously N/A)
- [ ] Feature flags: incremental / gateable work sits behind a registered flag (or consciously N/A)
- [ ] Boundaries respected: no extended→extended dep, no extended-module edit to `base.prisma` / the generated `schema.prisma` (own-fragment tables are fine ; `check:tiers` enforces)
- [ ] Codegen fresh (`pnpm gen`) ; no generated file hand-edited
- [ ] Strict TS holds ; `tsc --noEmit` passes ; input validated with zod
- [ ] Every meaningful async component has a layout-accurate `Skeleton` loading state
- [ ] A module with a page has a `PRIMARY_NAV` entry (auto-adds it to global-search "Go to") ; a module with searchable entities registers a `registerSearchSource` at boot (self-scoped, server-built hrefs) + a `globalSearch.groups.<id>` heading (or consciously N/A)
- [ ] Module README updated (API + data model) ; user + dev docs updated where they apply
- [ ] i18n keys added for en + fr
- [ ] CHANGELOG fragment added under `changelog.d/` (not a direct `CHANGELOG.md` edit)
- [ ] `register*` helpers wired into [services/api/src/server.ts](services/api/src/server.ts)
- [ ] Work happened in its own worktree/branch ; landed as a PR into `develop`, not a direct push to a shared checkout
- [ ] Agent-authored commits/PRs are authored as `monark-agent`, pushed with `MONARK_AGENT_TOKEN` — never the operator's personal identity
- [ ] Pre-PR gate passes: `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers && pnpm check:modules && pnpm check:i18n && pnpm check:mcp`
