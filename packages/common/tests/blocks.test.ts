import { describe, expect, it } from "vitest";
import {
  blocksToText,
  checklistProgress,
  textToBlocks,
  isDocumentValue,
  EMPTY_DOCUMENT,
} from "../src/blocks";

// A representative BlockNote document : a heading, a paragraph with a link, and
// a nested bullet list. `blocksToText` must flatten it top-to-bottom, one line
// per text-bearing block, walking children.
const DOC = [
  {
    type: "heading",
    props: { level: 1 },
    content: [{ type: "text", text: "Runbook", styles: {} }],
    children: [],
  },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "See ", styles: {} },
      {
        type: "link",
        href: "https://x",
        content: [{ type: "text", text: "the deploy steps", styles: {} }],
      },
      { type: "text", text: " first.", styles: {} },
    ],
    children: [],
  },
  {
    type: "bulletListItem",
    content: [{ type: "text", text: "Parent item", styles: {} }],
    children: [
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "Nested item", styles: {} }],
        children: [],
      },
    ],
  },
];

describe("blocksToText", () => {
  it("flattens a document top-to-bottom, one line per text block", () => {
    expect(blocksToText(DOC)).toBe(
      "Runbook\nSee the deploy steps first.\nParent item\nNested item",
    );
  });

  it("returns '' for empty / non-array / null values", () => {
    expect(blocksToText(EMPTY_DOCUMENT)).toBe("");
    expect(blocksToText([])).toBe("");
    expect(blocksToText(null)).toBe("");
    expect(blocksToText("legacy html string")).toBe("");
    expect(blocksToText(undefined)).toBe("");
  });

  it("skips blocks with no text but keeps their children", () => {
    const doc = [
      { type: "image", props: { url: "x" }, content: undefined, children: [] },
      {
        type: "paragraph",
        content: undefined,
        children: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "kept", styles: {} }],
            children: [],
          },
        ],
      },
    ];
    expect(blocksToText(doc)).toBe("kept");
  });

  it("reads text out of table content", () => {
    const doc = [
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                [{ type: "text", text: "A1", styles: {} }],
                [{ type: "text", text: "B1", styles: {} }],
              ],
            },
          ],
        },
        children: [],
      },
    ];
    expect(blocksToText(doc)).toBe("A1 B1");
  });
});

describe("checklistProgress", () => {
  it("counts checked / total check-list items, including nested ones", () => {
    const doc = [
      { type: "checkListItem", props: { checked: true }, content: [], children: [] },
      { type: "checkListItem", props: { checked: false }, content: [], children: [] },
      { type: "paragraph", content: [{ type: "text", text: "x", styles: {} }], children: [] },
      {
        type: "checkListItem",
        props: { checked: true },
        content: [],
        children: [{ type: "checkListItem", props: { checked: false }, content: [], children: [] }],
      },
    ];
    expect(checklistProgress(doc)).toEqual({ done: 2, total: 4 });
  });

  it("returns zeroes for no checklist / non-array", () => {
    expect(checklistProgress([{ type: "paragraph", content: [], children: [] }])).toEqual({
      done: 0,
      total: 0,
    });
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 });
    expect(checklistProgress(null)).toEqual({ done: 0, total: 0 });
  });
});

describe("textToBlocks", () => {
  it("makes one paragraph per line and round-trips through blocksToText", () => {
    const blocks = textToBlocks("first line\nsecond line");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
    expect(blocksToText(blocks)).toBe("first line\nsecond line");
  });

  it("makes an empty paragraph for a blank line", () => {
    const blocks = textToBlocks("");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "paragraph", content: [] });
    expect(blocksToText(blocks)).toBe("");
  });
});

describe("isDocumentValue", () => {
  it("distinguishes a block array from a legacy HTML string", () => {
    expect(isDocumentValue([])).toBe(true);
    expect(isDocumentValue(DOC)).toBe(true);
    expect(isDocumentValue("<p>legacy</p>")).toBe(false);
    expect(isDocumentValue(null)).toBe(false);
  });
});
