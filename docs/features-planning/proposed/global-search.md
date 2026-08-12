# Global search — an extensible core search engine

Status: **shipped** (2026-08-09 ; this stays as the design record, as-built truth
lives in [@monark/search](../../../packages/search/README.md) + CLAUDE.md's
"Navigation & global search"). Turned the contextual, web-composed command palette
into a true **global** search where any module contributes results through a core
**search-source registry** — the same "register at boot, list at query time"
pattern as event types / automation nodes / permissions.

## Context

Today search is **web-orchestrated and contextual**. The command palette
(`services/web/src/components/global-search/`) runs only the providers whose
`isActive(pathname)` matches the current section, and each provider runs its own
module tRPC query and builds its own hrefs client-side. There is **no server-side
aggregation**. So on `/wiki` you get wiki results, on `/kanban` kanban results —
never one query across everything. Data records have **no global search at all**
(the data provider only searches the model you're currently viewing).

## Decisions (locked with the user)

- **Global by default ; retire the contextual providers.** The palette always
  searches every module, grouped by module, regardless of route. The five
  `*-search-provider.tsx` components + the `SEARCH_PROVIDERS` array are removed ;
  their logic moves server-side into sources.
- **Include cross-model data-record search in v1** (net-new backend work).

## Architecture

- **Core registry — `@monark/common/src/search-registry.ts`** (mirrors
  `event-registry.ts`, server-safe, zero new deps for modules since they already
  depend on `@monark/common`):
  - `type SearchHit = { id; title; subtitle?; icon?; href }` — `href` is
    app-relative (built server-side now, not in the web providers). `icon` is an
    optional glyph string (e.g. a wiki page's emoji) ; the group's default icon is
    a web concern keyed by `groupId`.
  - `type SearchSource = { module; groupId; label; run(ctx: TrpcContext, query, limit): Promise<SearchHit[]> }`
    — `run` reuses the module's existing data-layer search and **scopes itself**
    (its own `requireOrg` + `requirePermission` / accessible-id resolution, exactly
    as the per-module procs do today).
  - `registerSearchSource(source)` / `listSearchSources()` / `_resetSearchRegistryForTesting()`.
- **Core `@monark/search` module (new, tier `core`)** owns `searchRouter` →
  **`search.global({ query })`**. It `listSearchSources()`, runs each `run` in
  parallel (`Promise.all`), **caps each source**, and returns `{ groupId, module,
hits }[]` (non-empty groups). A source that throws (incl. permission-denied) is
  caught + logged and contributes `[]` — one bad source never fails the search.
  Depends only on `@monark/common` to _list_ sources — **no dependency on the
  content modules** (same decoupling as automation's node registry).
- **Module sources** register at api boot next to the other `register*` calls:
  `registerWikiSearchSource`, `registerKanbanSearchSource`,
  `registerCalendarSearchSource`, `registerAutomationSearchSource` (parity with
  today), and a **new** `registerDataModelsSearchSource` doing cross-model record
  search.

## The one net-new backend piece: cross-model data-record search

Data Models has no "search all records" today. Add
`searchRecordsAcrossModels(ctx, query, limit)` : resolve the models the caller can
`record-read` in the org, then match the **denormalized `DataRecord.title`**
(`contains`, case-insensitive) across those models with the same row-level access
filter `listDataRecords` uses (roleIds / bypass), projecting each hit to
`{ id, title, subtitle: modelName, href: "/data/models/<modelKey>?record=<id>" }`.

## Web changes (palette goes global)

Minimal, because the render primitives are already source-agnostic:

- `global-search-dialog.tsx` calls `trpc.search.global.useQuery({ query }, { enabled: open && canSearch })`
  once (debounced 250ms, `SEARCH_MIN_QUERY = 2`), instead of mapping
  `activeProviders`.
- Render each returned group with the existing `SearchResultsGroup` (heading
  `globalSearch.groups.<groupId>`, its empty/loading policy unchanged) ; render
  each hit as a generic `CommandItem onSelect={() => go(hit.href)}` with an icon
  (per-hit glyph, else a `groupId → lucide` map) + title + optional subtitle.
- The "Go to" navigation group (`routes.ts`, from `PRIMARY_NAV`) is unchanged.
- Remove `search-providers.ts`, the five `*-search-provider.tsx`, and the
  `SearchProvider` type. Keep `search-contract.ts` (`SEARCH_MIN_QUERY`),
  `search-results-group.tsx`, `routes.ts`.

## Integration points (the four systems)

- **RBAC** — unchanged in shape ; each source enforces its own module permission +
  accessible-id / row-access scoping. The fan-out adds no central ACL.
- **Events / Notifications / Flags** — N/A.
- **Extensibility** — a new module gets into global search by registering one
  source at boot ; no web or core edit, exactly like a new event auto-appears in
  webhooks / automation triggers.

## Edge cases & risks

- **Per-keystroke fan-out.** Removing the `isActive` gate runs every source on
  every (debounced) query. Each source is bounded (`limit`, e.g. 8) and the query
  is `enabled`-gated + debounced ; acceptable. A slow source can't stall others
  (independent `Promise.all` entries, each own `take`).
- **Icons across the server boundary.** Hits carry a glyph string (emoji) or none ;
  the palette owns the `groupId → lucide` fallback map (icons are components, not
  serializable).
- **Ranking.** v1 groups by module with each source ordering its own hits — **no
  cross-source relevance ranking**. That + fuzzy / full-text matching (some modules
  already have text projections: `wiki.contentText`, `kanban.descriptionText`,
  data-model indexing) are follow-ups, not v1.

## Fuzzy matching (shipped as a fast-follow, 2026-08-09)

Each source's search was upgraded from substring `contains` to **trigram
(`pg_trgm`) fuzzy matching** — typo-tolerant + relevance-ranked. `pg_trgm` +
GIN `gin_trgm_ops` indexes on the searched columns (migration
`20260809000000_search_trigram_indexes`), and raw-SQL helpers in `@monark/db`
(`trigramMatch` = `ILIKE` substring OR `word_similarity > threshold` ;
`trigramOrder` = rank by best similarity). Ranking stays **per-group** (grouped by
module, each ordered by closeness).

## Out of scope

- **Cross-source** unified relevance ranking (a merged "Top results" across
  modules) — the scores now exist, so this is an easy follow-up.
- Postgres **full-text search** (`tsvector`) for long bodies — trigram covers the
  palette's short-title case ; FTS would add stemming/relevance for long content.
- Saved searches, search history, keyboard result-preview.

## Phases

A. Core registry (`@monark/common`) + `@monark/search` module (`search.global`).
B. Module sources (wiki / kanban / calendar / automation) + the new data-models
cross-model search ; wire at boot.
C. Palette rewrite to `search.global` ; remove the contextual providers.
D. Gate + docs (CLAUDE.md house pattern, a technical doc, module READMEs) +
CHANGELOG + memory + tests (registry unit, `search.global` fan-out + isolation,
data cross-model search).
