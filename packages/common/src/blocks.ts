// Block-document content model + a pure, dependency-free text extractor.
//
// The app's block editor (BlockNote, in the web service) persists content as a
// JSON array of blocks. This module is the *server-safe* substrate for that
// content : a minimal structural type plus `blocksToText`, shared by the web
// (cell previews, search boxes) and by server code with **no DOM and no editor
// runtime** (`@monark/data-models` title-derivation + indexing, wiki search).
//
// The types here are a deliberately loose structural subset of BlockNote's own
// `Block` shape — enough to walk text out of any block tree — so nothing in the
// core depends on the web editor library. Values coming off the wire / the DB
// are treated as `unknown` and narrowed defensively.

/** A document's content : the persisted JSON shape is an array of blocks. */
export type DocumentBlock = {
  type?: string;
  /** Per-block props (e.g. a `checkListItem`'s `checked`, a heading's `level`). */
  props?: Record<string, unknown>;
  /** Inline content (an array of runs) or a table content object, or nothing. */
  content?: unknown;
  /** Nested blocks (list items, nested paragraphs, …). */
  children?: unknown;
};

/**
 * Build a minimal block document from plain text — one paragraph per line (blank
 * lines become empty paragraphs). Lets non-editor callers (e.g. an automation
 * node) write a page/description body ; the block editor fills in defaults +
 * ids when it loads the result as `initialContent`.
 */
export function textToBlocks(text: string): DocumentBlock[] {
  return text.split("\n").map((line) => ({
    type: "paragraph",
    props: {},
    content: line.length > 0 ? [{ type: "text", text: line, styles: {} }] : [],
    children: [],
  }));
}

/** The canonical "no content" value : an empty block array. */
export const EMPTY_DOCUMENT: DocumentBlock[] = [];

/** True when a value is a block array (as opposed to a legacy HTML string). */
export function isDocumentValue(value: unknown): value is DocumentBlock[] {
  return Array.isArray(value);
}

// Flatten one block's inline content to text. Handles the common run shapes :
// styled text (`{ type: "text", text }`), links (`{ type: "link", content }`
// whose content is itself styled runs), table content (`{ rows: [{ cells }] }`),
// and anything else carrying a `text` string (e.g. mentions).
function inlineToText(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((run) => {
        if (!run || typeof run !== "object") return "";
        const r = run as Record<string, unknown>;
        if (r.type === "text" && typeof r.text === "string") return r.text;
        if (r.type === "link") return inlineToText(r.content);
        if (typeof r.text === "string") return r.text;
        return "";
      })
      .join("");
  }
  // Table content : { type: "tableContent", rows: [{ cells: [ inline[] ] }] }.
  if (content && typeof content === "object" && "rows" in content) {
    const rows = (content as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows
        .map((row) => {
          const cells = (row as { cells?: unknown })?.cells;
          return Array.isArray(cells) ? cells.map(inlineToText).join(" ") : "";
        })
        .join(" ");
    }
  }
  return "";
}

/** Checklist tally over a block document : how many check-list items are done. */
export type ChecklistProgress = { done: number; total: number };

/**
 * Count the check-list items (BlockNote `checkListItem` blocks) in a document
 * and how many are checked, walking nested children. Powers the Kanban card
 * progress bar now that a card's checklist lives in its block body rather than a
 * separate subtasks field. Non-array input yields `{ done: 0, total: 0 }`.
 */
export function checklistProgress(blocks: unknown): ChecklistProgress {
  let done = 0;
  let total = 0;
  const walk = (arr: unknown[]): void => {
    for (const b of arr) {
      if (!b || typeof b !== "object") continue;
      const block = b as DocumentBlock & { props?: { checked?: unknown } };
      if (block.type === "checkListItem") {
        total += 1;
        if (block.props?.checked === true) done += 1;
      }
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  if (Array.isArray(blocks)) walk(blocks);
  return { done, total };
}

/**
 * Extract plain text from a block document (or any value ; non-arrays yield "").
 * Each block that carries text contributes one line, in document order, with
 * nested children walked depth-first — so the result reads top-to-bottom like
 * the rendered page. Used for title-derivation, search, indexing, and previews.
 */
export function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const lines: string[] = [];
  const walk = (arr: unknown[]): void => {
    for (const b of arr) {
      if (!b || typeof b !== "object") continue;
      const block = b as DocumentBlock;
      const line = inlineToText(block.content).trim();
      if (line) lines.push(line);
      if (Array.isArray(block.children)) walk(block.children);
    }
  };
  walk(blocks);
  return lines.join("\n");
}
