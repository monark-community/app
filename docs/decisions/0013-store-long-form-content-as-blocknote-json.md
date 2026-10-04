---
type: decision
status: accepted
date: 2026-08-08
---

# 0013. Store long-form content as BlockNote JSON

## Context

All long-form content used one Tiptap rich-text editor that stored raw HTML, sanitized only when shown: the wiki page body, the kanban card description, the calendar event description and the data-model rich-text field. Wiki pages and card descriptions needed Notion-style editing: a slash menu, drag handles, nested blocks and checklists. Raw HTML also kept a cross-site scripting surface open at every place it was rendered. The app was pre-release, with only a handful of existing pages.

## Options

| Option                                       | For                                                                              | Against                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Extend the Tiptap editor with block features | One editor; no migration                                                         | Building drag handles, slash menu and nesting ourselves                                    |
| BlockNote, still storing HTML                | Block UX with no storage change                                                  | Lossy round-trips; keeps the HTML rendering risk                                           |
| BlockNote, storing its JSON blocks           | Block UX out of the box on the same ProseMirror base; lossless; renders as React | Search, titles and indexing must extract text from JSON; existing content must be migrated |

## Decision

Use BlockNote and store its native JSON block array as the source of truth, alongside the existing rich-text editor rather than replacing it. Wiki bodies, kanban card descriptions (whose separate subtasks field became checklist blocks) and a new data-model document field type use blocks. The calendar description and the rich-text field type stay as rich text, because a block canvas is too much for short inline text. Existing HTML bodies were reset to empty rather than converted, since the app was pre-release.

The deciding reason: BlockNote gives the block editing UX on the ProseMirror base already in use, and JSON storage is lossless and removes rendering HTML.

## Consequences

- Block content renders as React, never as injected HTML.
- Modules that search or derive titles keep a plain-text copy of block content, updated on every write, using a shared helper in `@monark/common/blocks`.
- Two editors to maintain, with no conversion between them.
- BlockNote's default Mantine renderer was incompatible with the React build bundled with Next.js 15.5, so the Ariakit renderer is used; one dependency (`lib0`) needed a pnpm patch to load in the browser.
- BlockNote's paid add-ons (multi-column, AI, PDF export) are out of scope.
