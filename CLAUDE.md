# Monark App — working agreement

Rules for every change in this monorepo. They encode conventions the codebase already follows ; the linked files are the source of truth when this doc and the code disagree.

Companion docs, read them before large work:

- [docs/technical-documentation/extensibility-contract.md](docs/technical-documentation/extensibility-contract.md) — the canonical "can a feature ship without touching core?" reference. Every integration point below is spelled out there in full.
- [docs/technical-documentation/architecture.md](docs/technical-documentation/architecture.md) — module system, event bus, boundaries.
- [modules.manifest.ts](modules.manifest.ts) — the core / extended tier registry.

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

Extended modules **cannot** edit `schema.prisma` (see boundaries below). When a feature needs per-user or per-org data but not indexed columns, use the sidecar instead of a migration: `setUserMetadataValue({ userId, module, key, value })` / `setOrganizationMetadataValue({ ... })`, identity `(parent_id, module, key)`, value is JSON. Gate reads / writes with the `users.read-metadata-for-module-<module>` / `write-…` permissions. Graduate to a per-module schema fragment only when you need to filter, sort, or FK on the value.

## Module boundaries

Two tiers, declared in [modules.manifest.ts](modules.manifest.ts) and enforced by `pnpm check:tiers` (a CI gate). **Core** modules ship with every deploy ; **extended** modules are business features on top. The walls, crossing one means the work should be a core change instead:

- Extended modules **MUST NOT** depend on another extended module. Compose via core packages, the event bus, or the metadata sidecar.
- Extended modules **MUST NOT** modify [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) — it's owned by `@monark/db`. Use the metadata sidecar, or wait for the per-module-fragment story.
- Extended modules **MUST NOT** mutate core registries directly — only call the `register*` APIs. Reaching into a registry's in-memory map bypasses validation and breaks boot ordering.
- Never rename or repurpose an existing domain event, flag, permission, or notification kind ; add new ones under your own module's namespace. Collisions across namespaces are a deploy-time error.

Full detail: [docs/technical-documentation/extensibility-contract.md](docs/technical-documentation/extensibility-contract.md).

## Codegen — never hand-edit generated files

Two artifacts are generated, not written: the `DomainEvent` union (`*.generated` under `contracts`) and the tRPC app router. They come from `pnpm gen` (= `pnpm gen:events` + `pnpm gen:routers`).

- After you touch a module's `contracts/events.ts` or its tRPC router, rerun `pnpm gen`.
- Never edit a `*.generated.ts` file by hand — your change is overwritten on the next gen, and **CI fails on codegen drift**.
- New modules must be listed in [modules.manifest.ts](modules.manifest.ts) or `gen` won't pick them up.

## Scaffolding a new module

Use `pnpm gen:module` to create a module — don't hand-build the skeleton. It lays down the `contracts` / `server` / `client` layout with the correct `package.json`, `tsconfig.json`, and vitest config wired up, so the new package is consistent with the rest of `packages/*` from the first commit. Add it to [modules.manifest.ts](modules.manifest.ts) with its tier, then wire its `register*` helpers into [services/api/src/server.ts](services/api/src/server.ts).

## Strict TypeScript

[tsconfig.base.json](tsconfig.base.json) runs full `strict` plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `useUnknownInCatchVariables`. Hold the line:

- **No `any`.** Reach for `unknown` + narrowing, generics, or a precise type. No `@ts-ignore` / `@ts-expect-error` without a one-line justification comment.
- **No non-null `!` to silence `noUncheckedIndexedAccess`.** Handle the `undefined` an index access can return.
- Validate all external input (tRPC input, request bodies, env) with `zod` at the boundary ; types alone don't survive the network.
- Relative imports carry **no `.js` extension** (moduleResolution is `Bundler`).
- Cross-package imports use the `@monark/<pkg>/{server,client,contracts}` entry points, never deep-reach into another package's `src`.
- `pnpm tsc --noEmit` (or `pnpm gen && pnpm --filter <pkg> typecheck`) must pass before a change is done.

## Loading states

Every meaningful component that fetches or awaits data ships a **layout-accurate skeleton** loading state — not a spinner, not a "Loading…" string, and not a bare fallback. Build it from the shared [`Skeleton`](services/web/src/components/ui/skeleton.tsx) primitive (`import { Skeleton } from "@/components/ui/skeleton"`).

- **Match the real layout.** The skeleton mirrors the loaded content's structure — same rows / columns / card shape, same approximate widths and heights — so nothing shifts when data arrives. A table renders skeleton rows with a cell per column (see the placeholder rows in [industries-list.tsx](<services/web/src/app/(authed)/industries/industries-list.tsx>)) ; a form or detail panel renders skeleton blocks where its fields land.
- **Cover every async surface**, including data behind a tRPC query, a Suspense boundary, or a route segment (`loading.tsx`). If a component has an `isLoading` / `isPending` branch, that branch is a skeleton.
- **"Meaningful" = the user waits on it.** Small, instant, or purely static components don't need one ; anything that renders after a fetch does.

## Shared UI patterns

Recurring list / detail-panel screens compose from the shared patterns in [services/web/src/components/patterns](services/web/src/components/patterns) — reach for these before re-pasting layout, so every admin screen reads and behaves the same. Import from the barrel: `import { FilterBar, TableDetailLayout, … } from "@/components/patterns"`.

- **`DataTable`** — the standard table (built on `@tanstack/react-table` + `@dnd-kit`), used by **every** list screen (admin included ; no hand-rolled `<ul>` card lists). Columns sort, hide, resize, and drag-reorder ; the layout persists per-browser under `storageKey` (localStorage). Chrome defaults to **`chrome="calm"`** : the idle sort glyph and the column-layout menu stay hidden until you hover the header / table, so a simple list reads as quiet as an old card list (pass `chrome="full"` to always show them). Every table has a mandatory **primary column** (first, pinned, never hidden/moved) with a main label + optional subtext + an optional **`leading`** slot (avatar / logo / status dot, so a row reads card-like) ; a hover icon opens the detail panel. Any non-computed cell can be made inline-editable with a column `edit` config (`getValue` / `onSave`) — click to edit, Enter/blur commits, Escape cancels ; never attach `edit` to computed or relational cells. Per-row actions collapse into a single trailing `…` menu via `rowActions` — do not add multiple inline action buttons to a row. Pass already-translated `labels` + action labels (i18n stays with the caller).
- **`FilterBar` + `FilterBarSearch` + `FilterMenu`** — the toolbar row above a table. `FilterBar` has three slots : `search` (pair with `FilterBarSearch`, which fills the row on mobile and holds ~350px on desktop), `filter` (pair with `FilterMenu`), and `actions` for the primary CTA. `FilterMenu` collapses every filter behind one icon button 8px from the search field : on desktop it opens a dropdown of labelled radio groups, on mobile a full-screen modal (title + top-right close). Pass filters declaratively as `FilterConfig[]` (id, label, options, value, onValueChange) — never scatter loose `Select`s across the toolbar.
- **`TableDetailLayout` + `useDetailPanelRoute`** — the table ↔ detail-panel combo. The hook keeps the selection in a `?<param>=` search param (deep-linkable, create = `?<param>=new`). On desktop the layout owns a persistent non-modal right-hand `Sheet`, keeps the table interactive behind it, and closes on Escape / outside-click (but not when clicking a row, a `…`/column menu, or a confirm dialog it spawned). On mobile the same panel goes full-screen and modal ; selecting a row (tap the primary label, which stops inline-editing there) takes over the screen.
  List/detail sections open records **in the panel by default** (limit page-nav), keeping the full `[id]` page only as an "open full page" escape hatch — this is the house pattern for admin (organizations, users, rbac, webhooks) as well as projects/industries. An editor rendered in the panel takes a `containment="container"` prop so it drops its `PageHeader`, anchors its save bar to the panel, and closes the panel on success instead of routing.
- **`PanelHeaderBar`** — the `h-14` panel controls bar (collapse + optional open-full-page), aligned to the appbar height. The open-full-page link is auto-hidden on mobile, where the panel is already full-screen.
- **`DirtyFormBar`** — the blessed save affordance for create/edit forms : a dirty-gated sticky "unsaved changes" banner (slides in only when the form differs from its loaded baseline ; Cancel **reverts** to baseline, delete lives in a `DangerCard`). `containment="viewport"` (default) pins it to the screen on full pages ; `containment="container"` anchors it to the bottom of a detail panel. Prefer this over the older `FormActionsFooter` (an always-visible inline button row, retained for the `@/components/fields` `AutoForm`).
- **`ConfirmDialog`** — controlled confirm dialog for delete / archive / destructive actions.

These are **app-local** on purpose (they encode routing, i18n, and RBAC-gated actions). Keep them text-free — pass already-translated labels in as props. The purely-presentational shells (`FilterBar`, `FormActionsFooter`) are candidates to graduate to `@monark/ui` only if a second surface needs them ; decide explicitly rather than pre-generalizing. See [projects-list.tsx](<services/web/src/app/(authed)/projects/projects-list.tsx>) and [industries-list.tsx](<services/web/src/app/(authed)/industries/industries-list.tsx>) for reference wiring.

## Per-module documentation

Each package owns a `README.md` following the shape already used across `packages/*` — see [packages/rbac/README.md](packages/rbac/README.md) and [packages/notifications/README.md](packages/notifications/README.md) as the template. When you add or change a module, update its README's relevant sections:

- **What's here** — the `/contracts`, `/server`, `/client` surface.
- **Key concepts** — the load-bearing design decisions.
- **Public API** — the exported functions / types table (this is the developer API doc).
- **Data model** — the Prisma models the module owns, under its `// ── MODULE: <name> ──` banner in [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma), plus the migration id.
- **Events emitted / consumed** and **tRPC surface**.

Two documentation audiences, both required when the change reaches them:

- **User docs** — [docs/user-guide](docs/user-guide) for anything user-facing. No code, written for the person using the app.
- **Developer docs** — [docs/technical-documentation](docs/technical-documentation) for internals (architecture, data models, extension points, runbooks). Add a new file per topic and cross-link ; update [docs/README.md](docs/README.md) if you add one.

All user-facing strings go through i18n in both `en` and `fr` — never hardcode visible text.

## CHANGELOG

Every completed feature, foundation shift, or substantive fix lands one dated entry in [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]`, newest first:

```
- YYYY-MM-DD: <Module / area> — <concise summary>. <one paragraph of what changed and why, linking the key files>.
```

Match the existing entries' density and tone. Link the touched files with relative paths.

## Prose style

House style throughout docs, commits, READMEs, and CHANGELOG: use `;` rather than an em-dash to join clauses. No em-dashes in prose.

## Pre-PR gate

Run the same sequence CI runs, in order, before a change is done:

```
pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers
```

`pnpm gen` first so a stale generated file doesn't fail `typecheck` ; `check:tiers` last confirms no boundary was crossed.

## Definition of done

- [ ] RBAC: write paths gated by a registered permission (or consciously N/A)
- [ ] Event bus: state changes emit a registered domain event (or consciously N/A)
- [ ] Notifications: user-facing signals go through `notify()` + a registered kind, en + fr (or consciously N/A)
- [ ] Feature flags: incremental / gateable work sits behind a registered flag (or consciously N/A)
- [ ] Boundaries respected: no extended→extended dep, no `schema.prisma` edit from an extended module
- [ ] Codegen fresh (`pnpm gen`) ; no generated file hand-edited
- [ ] Strict TS holds ; `tsc --noEmit` passes ; input validated with zod
- [ ] Every meaningful async component has a layout-accurate `Skeleton` loading state
- [ ] Module README updated (API + data model) ; user + dev docs updated where they apply
- [ ] i18n keys added for en + fr
- [ ] CHANGELOG entry added, dated, under `[Unreleased]`
- [ ] `register*` helpers wired into [services/api/src/server.ts](services/api/src/server.ts)
- [ ] Pre-PR gate passes: `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers`
