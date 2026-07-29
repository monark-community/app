import { describe, expect, it } from "vitest";
import { KANBAN_SUBTASK_MAX, parseSubtasks } from "../src/contracts/types";

// `parseSubtasks` is the single place the subtask JSON shape is trusted : it
// coerces an opaque value (a Prisma `Json` column read, or a client-supplied
// JSON string that's been `JSON.parse`d) into a well-formed `KanbanSubtask[]`,
// dropping anything malformed. These cover the coercion rules directly (no DB).

describe("parseSubtasks", () => {
  it("returns [] for non-array input", () => {
    expect(parseSubtasks(null)).toEqual([]);
    expect(parseSubtasks(undefined)).toEqual([]);
    expect(parseSubtasks("[]")).toEqual([]); // a raw string, not a parsed array
    expect(parseSubtasks({ id: "a", title: "x", done: false })).toEqual([]);
    expect(parseSubtasks(42)).toEqual([]);
  });

  it("keeps well-formed items in order", () => {
    const input = [
      { id: "a", title: "First", done: false },
      { id: "b", title: "Second", done: true },
    ];
    expect(parseSubtasks(input)).toEqual(input);
  });

  it("drops malformed items (missing/!string id or title, non-objects)", () => {
    const input = [
      { id: "ok", title: "keep", done: false },
      { id: 1, title: "num id", done: false }, // id not a string
      { id: "x", done: true }, // missing title
      { title: "no id", done: false }, // missing id
      null,
      "string",
      42,
    ];
    expect(parseSubtasks(input)).toEqual([{ id: "ok", title: "keep", done: false }]);
  });

  it("coerces `done` to a strict boolean (only `true` is truthy)", () => {
    const input = [
      { id: "a", title: "a", done: "true" }, // truthy string, but not === true
      { id: "b", title: "b", done: 1 },
      { id: "c", title: "c" }, // absent
      { id: "d", title: "d", done: true },
    ];
    expect(parseSubtasks(input).map((s) => s.done)).toEqual([false, false, false, true]);
  });

  it("caps id (64) and title (500) length defensively", () => {
    const [s] = parseSubtasks([{ id: "i".repeat(200), title: "t".repeat(2000), done: false }]);
    expect(s?.id).toHaveLength(64);
    expect(s?.title).toHaveLength(500);
  });

  it("caps the count at KANBAN_SUBTASK_MAX", () => {
    const many = Array.from({ length: KANBAN_SUBTASK_MAX + 25 }, (_, i) => ({
      id: `id-${i}`,
      title: `t-${i}`,
      done: false,
    }));
    const out = parseSubtasks(many);
    expect(out).toHaveLength(KANBAN_SUBTASK_MAX);
    // Keeps the leading items (order-preserving).
    expect(out[0]?.id).toBe("id-0");
  });
});
