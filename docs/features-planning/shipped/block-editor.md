# Block editor — Notion-style block editing

Status: **shipped** (this stays as the design record ; the as-built truth lives in the
touched modules' READMEs). This spec covers introducing a block editor alongside the
existing rich-text editor, storing block content as JSON, and making a block/document
field a first-class capability of the Data Models engine. Delivered 2026-08-08 : the
`DOCUMENT` Data Models field type, the wiki body, and the kanban card description all use
the BlockNote block editor (Ariakit renderer) ; the kanban subtasks field was retired in
favour of in-body checklist blocks ; the calendar description stays rich text.

## Context

Today all long-form content in the app uses a single Tiptap v3 editor
(`services/web/src/components/fields/inputs/rich-text-editor.tsx`) that stores **raw
HTML strings**, sanitized only at render (client `DOMPurify`, default config). It is
used at three edit sites — the **wiki page body**, the **kanban card description**, and
the **calendar event description** — plus the `richText` Data Models field type (via the
`RichTextField` AutoForm wrapper). The field-type seam is clean and centralized:
`RichTextFieldDef` (fields `types.ts`) ↔ registry / cells / schema / adapter ↔
`RICH_TEXT` in `@monark/data-models/contracts`.

We want a Notion-style **block editor** (slash menu, drag handles, nested blocks) for
document-like surfaces, while keeping the lightweight rich-text editor for compact,
inline use. Since the stack is already Tiptap/ProseMirror, **BlockNote** (a block editor
built on that same foundation) is the natural choice.

## Decisions (locked)

- **Library: BlockNote.** Built on Tiptap/ProseMirror ; React + TS native ; slash menu,
  drag handles, and nested blocks out of the box. Free core is MPL-2.0 ; the paid "xl"
  add-ons (multi-column, AI, PDF export) are out of scope.
- **Storage: JSON blocks.** BlockNote's native `Block[]` array is the source of truth,
  not HTML. This is lossless and removes the XSS-at-render surface (blocks render as
  React, never `dangerouslySetInnerHTML`). Cost: a data migration of existing HTML plus
  changes to title-derivation / search / indexing, which currently text-extract from HTML.
- **Coexistence, not replacement.** The `richText` type and `RichTextEditor` stay for
  inline / compact surfaces. We **add a new `document` field type** (Data Models
  `DOCUMENT`) for block content, and switch the **wiki body** and the **kanban card
  description** over to it. The **calendar event description stays rich text** (a block
  canvas is overkill for a short event blurb) — a deliberate coexistence line.
- **No content backfill.** The app is pre-release, so existing HTML bodies are **reset to
  empty** on the column migration rather than converted ; authors re-enter the handful of
  pages that exist. (This drops the `htmlToBlocks` converter the earlier draft planned.)

## Goals

- A reusable `BlockEditor` (edit) + `BlockView` (read-only) pair, block-JSON in/out,
  theme-aware, client-only (BlockNote touches the DOM).
- A pure, server-safe `blocksToText(blocks)` used for title-derivation, search, indexing,
  and cell previews ; a pure `htmlToBlocks(html)` for the one-time legacy backfill (the
  old editor's HTML vocabulary is small and known: h1–h4, p, bold / italic / strike /
  code, ul / ol / li, blockquote, link).
- A first-class Data Models `DOCUMENT` field type (config, value schema, title, query),
  wired through the fields toolkit exactly like `richText` is.
- Wiki / kanban / calendar migrated to block storage + the block editor, with existing
  content backfilled.

## Non-goals

- Retiring the rich-text editor or the `richText` field type (they stay).
- Custom blocks (embeds, tables-as-blocks, mentions) in v1 ; ship the standard block set
  first, extend later via BlockNote's schema API.
- Real-time collaborative editing (BlockNote supports it, but out of scope here).
- Server-side rendering of block content (read views are client-hydrated like today).

## Data model

Block content persists as a JSON array of BlockNote blocks.

- **Data Models `DOCUMENT`** — new value in the `DataFieldType` enum
  (`packages/db/prisma/base.prisma`, a core change ; data-models is a core module). The
  record value lives in `DataRecord.data` JSONB as a `Block[]` array. Empty = `[]`.
  Config schema is empty (like `RICH_TEXT`). Title-derivation and indexing use
  `blocksToText`. Query maps `DOCUMENT` → `text` (filter on the extracted plaintext).
- **Wiki** — `WikiPage.content` changes from `String @default("")` to `Json` (block
  array). Migration backfills each existing HTML string via `htmlToBlocks`.
- **Kanban** — the card description column changes to `Json` (block array) ; backfilled.
- **Calendar** — the event description column changes to `Json` (block array) ; backfilled.

Because the app is pre-release with negligible real data, the backfill is a best-effort
structured conversion over the known HTML vocabulary ; anything unmapped degrades to a
paragraph block rather than being lost. Fidelity is fully restored on the next edit.

## API surface

- `BlockEditor` (web) — `{ value: Block[]; onChange: (blocks: Block[]) => void; editable?;
placeholder?; fill?; … }`. Client-only (dynamic import, no SSR).
- `BlockView` (web) — `{ value: Block[] }`, a non-editable BlockNote instance for read
  surfaces.
- `blocksToText(blocks): string` — pure, dependency-light, server-safe (walks block
  `content` inline runs + `children`). Lives where both web and `@monark/data-models`
  can use it ; the canonical copy is server-safe (no React / DOM).
- `htmlToBlocks(html): Block[]` — pure converter for the legacy vocabulary, used by the
  backfill migration script and as a lazy fallback for any un-migrated value.
- Data Models contracts: `DocumentFieldDef` config `{}` ; `valueSchemaFor` → a permissive
  block-array schema ; `deriveTitle` / indexing via `blocksToText`.
- Fields toolkit: `type: "document"` descriptor ; registry input → `BlockEditor`, cell →
  `blocksToText` preview, read → `BlockView`, zod → block-array fragment, adapter
  `DOCUMENT` ↔ `document`.

## UI flows

- **Wiki page** — the body becomes a full-height `BlockEditor` (slash menu, drag handles,
  nesting) ; read-only viewers get `BlockView`. Autosave stays debounced.
- **Kanban card / calendar event** — the description field becomes a `BlockEditor`
  (compact height, `fill` off) ; read chips / previews use `blocksToText`.
- **Data Models** — a field of type `document` renders a `BlockEditor` in the record
  detail panel ; the table cell shows a truncated `blocksToText` preview ; `richText`
  remains available as the lighter option.

## Dependencies

- `@blocknote/core`, `@blocknote/react`, and one UI package. Default to `@blocknote/mantine`
  for v1 velocity (self-contained, theme-aware) ; a `@blocknote/shadcn` theming pass to
  match the design system is a follow-up. BlockNote ships its own CSS (independent of the
  Tailwind version) ; the editor must be a client-only dynamic import under Next 15.
- A tiny HTML parser for the server-safe `htmlToBlocks` backfill (e.g. `node-html-parser`),
  scoped to the migration path.

## Integration points (the four systems)

- **RBAC** — unchanged ; the surfaces already gate their writes (`wiki.update`,
  kanban / calendar permissions, data-models `record-write`).
- **Events** — content-change detection on wiki / kanban / calendar switches from string
  compare to a block-array compare (or a `blocksToText` compare) ; event shapes unchanged.
- **Notifications** — N/A.
- **Feature flags** — optional `data-models.block-field` / a global `block-editor` flag to
  gate the rollout ; decide at build time. The wiki/kanban/calendar swap can ride their
  existing flags.

## Edge cases & risks

- **Legacy value shape.** During transition a column may hold either a legacy HTML string
  or a block array. Loaders branch on the runtime shape ; `blocksToText` and read views
  handle both (HTML → strip tags ; blocks → walk). The backfill migration converts in
  place so this window is short.
- **Server has no DOM.** `blocksToText` must be pure JSON-walking (no BlockNote runtime,
  no DOM) so it runs in `@monark/data-models` and API. `htmlToBlocks` uses a DOM-free HTML
  parser.
- **Bundle size.** BlockNote + its UI package is heavier than the bare Tiptap toolbar ;
  mitigate with dynamic import so it only loads on surfaces that use it.
- **Next 15 / React 19 / Turbopack.** BlockNote is client-only ; wrap in `dynamic(() =>
…, { ssr: false })` and render a skeleton fallback (matches the loading-state rule).
- **Search / title parity.** Wiki search and Data Models title-derivation must produce the
  same plaintext they do today ; covered by `blocksToText` unit tests against known blocks.

## Implementation phases

0. **Foundations (non-destructive).** Add deps ; build `BlockEditor` + `BlockView` ;
   implement + unit-test `blocksToText` and `htmlToBlocks` ; theme-aware styling ;
   screenshot-harness story for visual validation.
1. **Data Models `DOCUMENT` type.** Enum + migration ; contracts (config / value schema /
   title / query) ; fields toolkit descriptor + registry / cells / schema / adapter ;
   AutoForm wiring ; dev fields playground entry.
2. **Wiki.** `content` → `Json` (existing reset to empty) ; a derived `contentText` column
   keeps search fast ; `wiki-page-view` uses `BlockEditor` / `BlockView` ; wiki search +
   event change-detection use `blocksToText`.
3. **Kanban.** Card description column → `Json` (existing reset to empty) ; swap the editor.
   **Calendar is intentionally left on rich text.**
4. **Gates + docs + tests + CHANGELOG + memory.** Full pre-PR gate ; update the fields
   README, data-models docs, and wiki docs ; CHANGELOG ; memory.

## Out of scope

- Custom / embed blocks, tables-as-blocks, @-mentions, collaborative cursors.
- Retiring rich text ; migrating inline `richText` fields to blocks (they stay by choice).
- Server-side block rendering / static export.
