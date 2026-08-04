import { describe, expect, it } from "vitest";
import { getCompletions, type CompletionField } from "../src/contracts/query-complete";

const FIELDS: CompletionField[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "priority", label: "Priority", kind: "number" },
  {
    key: "status",
    label: "Status",
    kind: "select",
    options: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
    ],
  },
  {
    key: "tags",
    label: "Tags",
    kind: "multiSelect",
    options: [
      { value: "red", label: "Red" },
      { value: "blue", label: "Blue" },
    ],
  },
  {
    key: "assignee",
    label: "Assignee",
    kind: "relation",
    options: [{ value: "u1", label: "Alice" }],
  },
  {
    key: "reviewers",
    label: "Reviewers",
    kind: "multiSelect",
    userValued: true,
    options: [{ value: "u1", label: "Alice" }],
  },
  { key: "done", label: "Done", kind: "boolean" },
  { key: "due", label: "Due", kind: "date" },
  {
    key: "sev",
    label: "Severity",
    kind: "orderedSelect",
    options: [
      { value: "LOW", label: "Low" },
      { value: "HIGH", label: "High" },
    ],
  },
];

const labelsAt = (text: string, caret = text.length) =>
  getCompletions(text, caret, FIELDS).map((c) => c.label);
const at = (text: string, caret = text.length) => getCompletions(text, caret, FIELDS);

describe("field stage", () => {
  it("suggests all fields on empty input (no OR)", () => {
    const out = at("", 0);
    expect(out.every((c) => c.kind === "field")).toBe(true);
    expect(out.map((c) => c.label)).toContain("title:");
    expect(out.map((c) => c.label)).not.toContain("OR");
  });

  it("filters + inserts field:, ranking key-prefix first", () => {
    const out = at("pri");
    expect(out[0]!.label).toBe("priority:");
    expect(out[0]!.insertText).toBe("priority:");
    expect(out[0]!.replaceStart).toBe(0);
    expect(out[0]!.replaceEnd).toBe(3);
  });

  it("preserves a leading negation", () => {
    const [c] = at("-stat");
    expect(c!.insertText).toBe("-status:");
  });

  it("offers OR after a completed predicate", () => {
    expect(labelsAt("status:open ")).toContain("OR");
    // …but not at the very start, nor right after '(' or a dangling OR.
    expect(labelsAt("", 0)).not.toContain("OR");
    expect(labelsAt("(")).not.toContain("OR");
    expect(labelsAt("status:open OR ")).not.toContain("OR");
  });
});

describe("operator stage", () => {
  it("offers comparison operators + between + presence for a number field", () => {
    const out = at("priority:");
    const l = out.map((c) => c.label);
    expect(l).toEqual(
      expect.arrayContaining(["priority:>", "priority:>=", "priority:<", "priority:a..b"]),
    );
    expect(l).not.toContain("priority:"); // the default (eq) is implicit, not listed
    expect(l).toEqual(expect.arrayContaining(["priority:empty", "priority:present"]));
    expect(out.find((c) => c.label === "priority:>")?.kind).toBe("operator");
    expect(out.find((c) => c.label === "priority:>")?.op).toBe("gt");
  });

  it("renders none-of as a negation form for a select", () => {
    const out = at("status:");
    expect(out.find((c) => c.op === "isNoneOf")?.insertText).toBe("-status:");
  });

  it("stops offering operators once a value is being typed", () => {
    // "status:op" → only the matching option, no operators.
    expect(labelsAt("status:op")).toEqual(["Open"]);
  });
});

describe("value stage", () => {
  it("select options show the human label, insert the value", () => {
    const out = at("status:");
    const open = out.find((c) => c.label === "Open");
    expect(open?.kind).toBe("value");
    expect(open?.insertText).toBe("status:open");
  });

  it("orderedSelect preserves a chosen comparison prefix", () => {
    const out = at("sev:>=");
    expect(out.find((c) => c.label === "High")?.insertText).toBe("sev:>=HIGH");
  });

  it("booleans offer true/false", () => {
    expect(labelsAt("done:")).toEqual(expect.arrayContaining(["done:true", "done:false"]));
  });

  it("date fields offer @variables and ordering operators", () => {
    const out = at("due:");
    expect(out.find((c) => c.label === "due:@today")?.kind).toBe("variable");
    expect(out.map((c) => c.label)).toEqual(expect.arrayContaining(["due:<", "due:a..b"]));
  });

  it("relation offers @me + option labels", () => {
    const l = labelsAt("assignee:");
    expect(l).toEqual(expect.arrayContaining(["assignee:@me", "Alice"]));
  });

  it("@me is offered for a user-valued multi-select", () => {
    expect(labelsAt("reviewers:")).toContain("reviewers:@me");
  });

  it("returns nothing for an unknown field", () => {
    expect(at("nope:")).toEqual([]);
  });
});

describe("localized detail (describeOp / describeVariable)", () => {
  it("uses the resolvers when provided, English otherwise", () => {
    const opts = {
      describeOp: (op: string) => `OP:${op}`,
      describeVariable: (t: string) => `VAR:${t}`,
    };
    const out = getCompletions("due:", 4, FIELDS, opts);
    expect(out.find((c) => c.op === "before")?.detail).toBe("OP:before");
    expect(out.find((c) => c.label === "due:@today")?.detail).toBe("VAR:@today");
    // Without resolvers, the English fallback stands.
    const plain = getCompletions("due:", 4, FIELDS);
    expect(plain.find((c) => c.op === "before")?.detail).toBe("before");
  });
});

describe("caret awareness", () => {
  it("replaces the whole word when the caret is mid-token", () => {
    // caret after "status", before ":open" → field stage, replace the full word.
    const out = getCompletions("status:open done:true", 6, FIELDS);
    const status = out.find((c) => c.label === "status:");
    expect(status?.replaceStart).toBe(0);
    expect(status?.replaceEnd).toBe(11); // end of "status:open"
  });

  it("clamps an out-of-range caret", () => {
    expect(() => getCompletions("abc", 99, FIELDS)).not.toThrow();
  });
});
