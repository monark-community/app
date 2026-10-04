---
type: concept
---

# Block editor

Long-form content in Monark, such as wiki pages, kanban card descriptions and data-model document fields, is edited in a Notion-style block editor (BlockNote) and stored as a JSON array of blocks, not HTML. The older rich-text editor stays for short, inline text. Most of what's specific here follows from two facts: content is JSON, and the editor is built once and never fed its value back.

## Two editors, by surface

| Editor                   | Stores                     | Used for                                                                              |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------- |
| Block editor (BlockNote) | JSON block array           | wiki page body, kanban card description and its checklist, data-model document fields |
| Rich text (Tiptap)       | HTML, sanitized when shown | calendar event description, data-model rich-text fields                               |

Block content renders as React components, never as injected HTML, which removes a whole class of cross-site scripting risk. Why JSON and why both editors stay is recorded in [Store long-form content as BlockNote JSON](../decisions/0013-store-long-form-content-as-blocknote-json.md).

## The shared substrate

Server code never imports the editor. A small, dependency-free module, `@monark/common/blocks`, gives every package what it needs from block content:

- Plain text of a document, used for titles, search, table cell previews and change events.
- Checklist progress (done and total), shown as the progress bar on a kanban card.
- Text to blocks, one paragraph per line, so code without an editor, such as an automation node writing a wiki page, can produce a valid body.

Client code imports it from that subpath, never the `@monark/common` package root. The root pulls in the server logger, which crashes in the browser.

## Plain-text projections

JSON is awkward to search. Modules that filter, search or derive titles from block content keep a plain-text copy in its own column, updated on every write: the wiki's page text and the kanban card's description text. Search stays a cheap text match instead of a walk through JSON. Data-model document fields don't get a column; their text is used for titles and indexing, but the field itself isn't filterable.

## Created once, never controlled

The editor is built exactly once from the value present when it mounts. Changes stream out through `onChange`, and the value is never passed back in. To show a different document, the component is remounted with a new key.

This matters most on phones. Mobile keyboards type through IME composition, and a React re-render in the middle of a composition aborts it. Updating state on every keystroke let ordinary letters through but swallowed Enter. So callers keep edits in a ref and save on a timer (the wiki) or flip a one-time "changed" flag (the kanban card form); the editor's part of the page doesn't re-render while someone types.

## Rendering details

- The editor and the read-only view are client-only and load behind a skeleton shaped like text, since BlockNote needs the browser DOM.
- The editor uses BlockNote's Ariakit renderer. The default Mantine renderer imports a React API that the React build bundled with Next.js 15.5 doesn't provide.
- A pnpm patch on `lib0`, a BlockNote dependency, guards a server-only `process.stdout` check that otherwise crashes in the browser.
- The editor's background is transparent so it blends into the page. On screens under 768 px the side gutters, which hold the drag handle and add-block button, shrink from 54 px to 36 px. A minimum height keeps an empty editor easy to tap.

## Limits

- There is no conversion between rich text and blocks; a field is one or the other.
- Document fields can't be filtered in a query.
- Only BlockNote's free blocks are available (no multi-column layout, AI or PDF export).

## Related

- [Store long-form content as BlockNote JSON](../decisions/0013-store-long-form-content-as-blocknote-json.md)
- [Data models and queries](data-models-and-queries.md)
- Wiki and Kanban package READMEs: [wiki](../../packages/wiki/README.md), [kanban](../../packages/kanban/README.md)
