# @monark/search

The unified global search — one tRPC procedure that fans out across every module
that registered a **search source**, and returns results grouped by module. Core
module. It powers the command palette (`Cmd/Ctrl+K`), replacing the older
contextual, per-section web providers.

## What's here

- **`/server`** — `searchRouter` (mounted at `trpc.search.*`) with a single
  procedure, **`search.global({ query })`**. It has **no dependency on the content
  modules** ; it only `listSearchSources()` (from `@monark/common`) and runs them.
- **`/contracts`** — none of note (no domain events).

## Key concepts

- **The registry lives in core, not here.** `registerSearchSource` /
  `listSearchSources` + the `SearchHit` / `SearchSource` types are in
  [`@monark/common`](../common/src/search-registry.ts) (like the event-type
  registry), so a module contributes a source with **zero new dependency** — it
  already depends on `@monark/common`. This package owns only the fan-out.
- **Fan-out + isolation.** `search.global` runs every source in parallel
  (`Promise.all`), caps each (`PER_SOURCE_LIMIT`), and returns the non-empty
  groups. A source that throws — including a permission-denied — is caught,
  logged, and contributes no hits, so one failing source never fails the search.
- **RBAC stays in the source.** Each source does its own `requireOrg` +
  `requirePermission` / accessible-id scoping (the same as its per-surface search
  did) ; the fan-out adds no central ACL.
- **Extensible for free.** A new module joins global search by calling
  `registerSearchSource` at api boot — no edit here or in the web palette, exactly
  like a new event auto-appears in webhooks / automation triggers.

## Public API

`@monark/search/server`

| Export         | Kind        | Purpose                                                      |
| -------------- | ----------- | ------------------------------------------------------------ |
| `searchRouter` | tRPC router | Mounted at `trpc.search.*` (just `global`).                  |
| `SearchGroup`  | type        | `{ groupId; module; hits: SearchHit[] }` — one result group. |

`search.global({ query })` → `SearchGroup[]` (non-empty groups only). `query` is
2–200 chars. Register sources with `registerSearchSource` from `@monark/common` ;
each returns `SearchHit { id, title, subtitle?, icon?, href }`.

## Registered sources

Wired at api boot in [`services/api/src/server.ts`](../../services/api/src/server.ts) :
`registerWikiSearchSource` (`wiki`), `registerKanbanSearchSource` (`kanban`),
`registerCalendarSearchSource` (`calendar`), `registerDataModelsSearchSource`
(`data`, cross-model record search), `registerAutomationSearchSource`
(`automation`). Each `groupId` maps to a `globalSearch.groups.<groupId>` heading +
an icon in the web palette.

## Data model

None — this module owns no tables. It is a pure aggregation surface over the
in-memory source registry.

## Events emitted / consumed

None.

## tRPC surface

`trpc.search.global` — see above. The web command palette
([`global-search-dialog.tsx`](../../services/web/src/components/global-search/global-search-dialog.tsx))
is the sole consumer.
