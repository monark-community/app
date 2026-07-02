import { describe, expect, it } from "vitest";
import { fieldColumn } from "@/components/fields/field-column";
import { schemaFor, schemaForFields } from "@/components/fields/schema";
import { defaultValueFor, type FieldDef, type FieldMessages } from "@/components/fields/types";

const messages: FieldMessages = {
  required: "required",
  invalidUrl: "invalidUrl",
  invalidEmail: "invalidEmail",
  tooShort: (min) => `tooShort:${min}`,
  tooLong: (max) => `tooLong:${max}`,
  tooSmall: (min) => `tooSmall:${min}`,
  tooLarge: (max) => `tooLarge:${max}`,
  notInteger: "notInteger",
  tooManyItems: (max) => `tooManyItems:${max}`,
};

describe("defaultValueFor", () => {
  it("returns type-appropriate empties", () => {
    expect(defaultValueFor({ type: "text", name: "a", label: "A" })).toBe("");
    expect(defaultValueFor({ type: "number", name: "n", label: "N" })).toBeNull();
    expect(defaultValueFor({ type: "boolean", name: "b", label: "B" })).toBe(false);
    expect(defaultValueFor({ type: "multiSelect", name: "m", label: "M", options: [] })).toEqual(
      [],
    );
    expect(
      defaultValueFor({
        type: "relation",
        name: "r",
        label: "R",
        multiple: true,
        source: { model: "x", loadOptions: async () => [], loadByIds: async () => [] },
      }),
    ).toEqual([]);
    expect(
      defaultValueFor({
        type: "relation",
        name: "r",
        label: "R",
        source: { model: "x", loadOptions: async () => [], loadByIds: async () => [] },
      }),
    ).toBeNull();
  });
});

describe("schemaFor — text", () => {
  const def: FieldDef = { type: "text", name: "t", label: "T", required: true, maxLength: 5 };
  const s = schemaFor(def, messages);
  it("rejects empty when required", () => {
    expect(s.safeParse("").success).toBe(false);
  });
  it("accepts a value", () => {
    expect(s.safeParse("hi").success).toBe(true);
  });
  it("enforces maxLength", () => {
    expect(s.safeParse("toolong").success).toBe(false);
  });
});

describe("schemaFor — richText", () => {
  const required = schemaFor(
    { type: "richText", name: "body", label: "Body", required: true },
    messages,
  );
  it("rejects visually-empty HTML when required", () => {
    expect(required.safeParse("<p></p>").success).toBe(false);
    expect(required.safeParse("").success).toBe(false);
  });
  it("accepts HTML with text content", () => {
    expect(required.safeParse("<p>Hello</p>").success).toBe(true);
  });
  it("allows empty when optional", () => {
    const opt = schemaFor({ type: "richText", name: "b", label: "B" }, messages);
    expect(opt.safeParse("<p></p>").success).toBe(true);
  });
});

describe("schemaFor — url", () => {
  const optional = schemaFor({ type: "url", name: "u", label: "U" }, messages);
  const required = schemaFor({ type: "url", name: "u", label: "U", required: true }, messages);
  it("allows empty when optional", () => {
    expect(optional.safeParse("").success).toBe(true);
  });
  it("rejects non-http", () => {
    expect(optional.safeParse("ftp://x").success).toBe(false);
    expect(optional.safeParse("notaurl").success).toBe(false);
  });
  it("accepts https", () => {
    expect(optional.safeParse("https://a.com").success).toBe(true);
  });
  it("rejects empty when required", () => {
    expect(required.safeParse("").success).toBe(false);
  });
});

describe("schemaFor — email", () => {
  const s = schemaFor({ type: "email", name: "e", label: "E" }, messages);
  it("validates format when present", () => {
    expect(s.safeParse("a@b.co").success).toBe(true);
    expect(s.safeParse("nope").success).toBe(false);
    expect(s.safeParse("").success).toBe(true);
  });
});

describe("schemaFor — number", () => {
  const s = schemaFor(
    { type: "number", name: "n", label: "N", integer: true, min: 0, max: 10, required: true },
    messages,
  );
  it("rejects null when required", () => {
    expect(s.safeParse(null).success).toBe(false);
  });
  it("rejects non-integers", () => {
    expect(s.safeParse(1.5).success).toBe(false);
  });
  it("enforces range", () => {
    expect(s.safeParse(-1).success).toBe(false);
    expect(s.safeParse(11).success).toBe(false);
    expect(s.safeParse(5).success).toBe(true);
  });
  it("allows null when optional", () => {
    const opt = schemaFor({ type: "number", name: "n", label: "N" }, messages);
    expect(opt.safeParse(null).success).toBe(true);
  });
});

describe("schemaFor — multiSelect / relation", () => {
  it("caps multiSelect at max", () => {
    const s = schemaFor(
      { type: "multiSelect", name: "m", label: "M", options: [], max: 2 },
      messages,
    );
    expect(s.safeParse(["a", "b", "c"]).success).toBe(false);
    expect(s.safeParse(["a", "b"]).success).toBe(true);
  });
  it("requires at least one when required", () => {
    const s = schemaFor(
      { type: "multiSelect", name: "m", label: "M", options: [], required: true },
      messages,
    );
    expect(s.safeParse([]).success).toBe(false);
  });
});

describe("schemaForFields", () => {
  it("validates a full payload against all field defs", () => {
    const fields: FieldDef[] = [
      { type: "text", name: "title", label: "Title", required: true },
      { type: "number", name: "count", label: "Count" },
      { type: "boolean", name: "active", label: "Active" },
      {
        type: "singleSelect",
        name: "status",
        label: "Status",
        options: [{ value: "a", label: "A" }],
      },
    ];
    const schema = schemaForFields(fields, messages);
    expect(schema.safeParse({ title: "x", count: 3, active: true, status: "a" }).success).toBe(
      true,
    );
    expect(schema.safeParse({ title: "", count: 3, active: true, status: "a" }).success).toBe(
      false,
    );
  });
});

describe("fieldColumn — sort accessor", () => {
  interface Row {
    when: Date;
    n: number;
    on: boolean;
    tags: string[];
  }
  const labels = { empty: "—", yes: "Y", no: "N", more: (n: number) => `+${n}` };
  const row: Row = { when: new Date("2020-01-01"), n: 42, on: true, tags: ["a", "b"] };

  it("returns a Date for date fields", () => {
    const col = fieldColumn<Row>(
      { type: "date", name: "when", label: "When" },
      { accessor: (r) => r.when, labels },
    );
    expect(col.sortAccessor?.(row)).toBeInstanceOf(Date);
  });
  it("returns the number for number fields, right-aligned", () => {
    const col = fieldColumn<Row>(
      { type: "number", name: "n", label: "N" },
      { accessor: (r) => r.n, labels },
    );
    expect(col.sortAccessor?.(row)).toBe(42);
    expect(col.align).toBe("right");
  });
  it("returns 0/1 for booleans", () => {
    const col = fieldColumn<Row>(
      { type: "boolean", name: "on", label: "On" },
      { accessor: (r) => r.on, labels },
    );
    expect(col.sortAccessor?.(row)).toBe(1);
  });
  it("returns the count for multiSelect", () => {
    const col = fieldColumn<Row>(
      { type: "multiSelect", name: "tags", label: "Tags", options: [] },
      { accessor: (r) => r.tags, labels },
    );
    expect(col.sortAccessor?.(row)).toBe(2);
  });
});
