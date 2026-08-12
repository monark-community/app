# Block editor (BlockNote)

Notion-style block editing lives alongside the older rich-text (Tiptap) editor.
This is the internals reference ; the [design record](../features-planning/proposed/block-editor.md)
has the rationale, and each consuming module's README/doc has the as-built detail.

## Where it lives

- **`@monark/common/blocks`** ([blocks.ts](../../packages/common/src/blocks.ts)) — the
  dependency-free, server-safe substrate. `blocksToText(blocks)` flattens a block
  document to plain text (title-derivation, search, cell previews, event diffs) ;
  `checklistProgress(blocks)` counts `checkListItem` done/total (the kanban card bar) ;
  `textToBlocks(text)` builds a minimal paragraph-per-line document (so a non-editor
  caller — e.g. a wiki automation node — can write a body) ; `DocumentBlock` is a
  loose structural subset of BlockNote's `Block` so nothing in the core depends on
  the web editor. **Import it from the `/blocks` subpath, never
  the `@monark/common` barrel** — the barrel pulls the pino logger, whose module-init
  reads `process.stdout.isTTY` and crashes in the browser.
- **`BlockEditor` / `BlockView`** ([block-editor.tsx](../../services/web/src/components/fields/inputs/block-editor.tsx))
  — the web components. Client-only (`dynamic(() => …, { ssr: false })`) with a
  layout-accurate skeleton, theme-aware (light/dark via `next-themes`). Content is a
  BlockNote `Block[]`.

## Storage

Block content persists as a **JSON block array**, not HTML — lossless and free of the
`dangerouslySetInnerHTML` XSS surface. Consumers that filter/search/derive titles keep
a **plain-text projection column** (`WikiPage.contentText`, `KanbanCard.descriptionText`)
in sync on write via `blocksToText`, so those paths stay cheap text `contains` rather
than walking jsonb. The Data Models `DOCUMENT` value lives in `DataRecord.data` and is
non-filterable (its title/index use `blocksToText`).

## The editor is create-once / uncontrolled — and why that matters on mobile

`useCreateBlockNote` is called with a **memoized options object** (empty deps) so the
editor is built exactly once from the value present at mount ; `onChange` streams the
document out, and we **never feed `value` back in**. To load a different document, the
element is **keyed** on the document id so it remounts. This is not just tidiness:

- Re-creating the editor mid-render tears down the ProseMirror view and drops the
  in-flight keystroke.
- On mobile, input goes through **IME composition** ; a React re-render mid-composition
  aborts it. A per-keystroke `setState` (the naïve `onChange={setBlocks}`) let plain
  characters through but **swallowed Enter**. The fix is to keep edits in a **ref** and
  autosave on a timer (wiki) or flip a one-shot dirty flag (kanban card form), so the
  editor's React subtree never re-renders while you type.

## Three environment gotchas (all fixed, worth remembering)

1. **`process.stdout.isTTY` crash** — a browser-reachable contracts file imported the
   `@monark/common` **barrel**, dragging the server pino logger into the client bundle.
   Fixed by the dependency-free **`@monark/common/blocks` subpath**. Rule: client code
   imports common via a subpath, never the barrel.
2. **`useEffectEvent is not a function`** — BlockNote's default **Mantine** UI does a
   bare `import { useEffectEvent } from "react"`, which Next 15.5's _vendored_ React
   (used for app-client) doesn't export. Fixed by using the **Ariakit** renderer
   (`@blocknote/ariakit`), which has no such import. (Next 16 would also fix it but is
   a larger upgrade.)
3. **`lib0` `process.stdout.isTTY`** — `lib0` (pulled by `@blocknote/core`) reads it
   unguarded at module-init. A **`pnpm patch`** ([patches/lib0@1.0.0-rc.22.patch](../../patches))
   guards it (`process.stdout && process.stdout.isTTY`).

## Styling

`.block-editor` overrides `--bn-colors-editor-background` to transparent so the editor
blends into the page ; the default 54px side gutters (which hold the drag handle + "+"
controls) are trimmed to 36px under 768px so the text column isn't squeezed on phones.
A `minHeight` prop sets `--bn-min-h` on the editable so an empty editor still has a
usable click target. See [globals.css](../../services/web/src/app/globals.css).

## Consumers

- **Data Models `DOCUMENT`** field type — [data-models README](../../packages/data-models/README.md).
- **Wiki** page body — [wiki.md](wiki.md).
- **Kanban** card description (+ its checklist) — [kanban.md](kanban.md).
- **Rich text stays** for compact/inline surfaces (the calendar event description, and
  the `richText` Data Models field type).
