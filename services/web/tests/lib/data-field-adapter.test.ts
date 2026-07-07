import { describe, expect, it } from "vitest";
import {
  dataFieldToFieldDef,
  recordDataToDefaultValues,
  type DataFieldForAdapter,
} from "@/components/fields/data-field-adapter";

function field(overrides: Partial<DataFieldForAdapter>): DataFieldForAdapter {
  return {
    id: "fld_1",
    key: "value",
    label: "Value",
    description: null,
    type: "TEXT",
    config: {},
    required: false,
    ...overrides,
  };
}

describe("dataFieldToFieldDef", () => {
  it("maps TEXT/LONG_TEXT config through", () => {
    const text = dataFieldToFieldDef(
      field({ type: "TEXT", config: { minLength: 2, maxLength: 10 } }),
    );
    expect(text).toMatchObject({ type: "text", name: "value", minLength: 2, maxLength: 10 });

    const longText = dataFieldToFieldDef(field({ type: "LONG_TEXT", config: { maxLength: 500 } }));
    expect(longText).toMatchObject({ type: "longText", maxLength: 500 });
  });

  it("maps RICH_TEXT / BOOLEAN / DATE / DATETIME with no extra config", () => {
    expect(dataFieldToFieldDef(field({ type: "RICH_TEXT" }))).toMatchObject({ type: "richText" });
    expect(dataFieldToFieldDef(field({ type: "BOOLEAN" }))).toMatchObject({ type: "boolean" });
    expect(dataFieldToFieldDef(field({ type: "DATE" }))).toMatchObject({ type: "date" });
    expect(dataFieldToFieldDef(field({ type: "DATETIME" }))).toMatchObject({ type: "datetime" });
  });

  it("maps NUMBER config", () => {
    const def = dataFieldToFieldDef(
      field({ type: "NUMBER", config: { min: 0, max: 100, integer: true } }),
    );
    expect(def).toMatchObject({ type: "number", min: 0, max: 100, integer: true });
  });

  it("maps SELECT to singleSelect and MULTI_SELECT to multiSelect (allowCustomValues -> allowCustom)", () => {
    const options = [{ value: "a", label: "A" }];
    const single = dataFieldToFieldDef(field({ type: "SELECT", config: { options } }));
    expect(single).toMatchObject({ type: "singleSelect", options });

    const multi = dataFieldToFieldDef(
      field({ type: "MULTI_SELECT", config: { options, allowCustomValues: true, max: 3 } }),
    );
    expect(multi).toMatchObject({ type: "multiSelect", options, allowCustom: true, max: 3 });
  });

  it("maps URL / EMAIL config", () => {
    expect(dataFieldToFieldDef(field({ type: "URL", config: { maxLength: 2000 } }))).toMatchObject({
      type: "url",
      maxLength: 2000,
    });
    expect(dataFieldToFieldDef(field({ type: "EMAIL", config: {} }))).toMatchObject({
      type: "email",
    });
  });

  it("maps RELATION, deriving `multiple` from cardinality and using the resolver when provided", () => {
    const config = {
      relationTarget: "Calendar",
      relationTargetKind: "SYSTEM_MODEL" as const,
      cardinality: "MANY" as const,
      max: 5,
    };
    const resolved = dataFieldToFieldDef(field({ type: "RELATION", config }), {
      relationSource: (c) => ({
        model: c.relationTarget,
        loadOptions: async () => [{ id: "1", label: "One" }],
        loadByIds: async () => [],
      }),
    });
    expect(resolved).toMatchObject({ type: "relation", multiple: true, max: 5 });
    if (resolved.type === "relation") {
      expect(resolved.source.model).toBe("Calendar");
    }
  });

  it("falls back to an empty relation source when no resolver is given", async () => {
    const def = dataFieldToFieldDef(
      field({
        type: "RELATION",
        config: {
          relationTarget: "other-model",
          relationTargetKind: "DATA_MODEL",
          cardinality: "ONE",
        },
      }),
    );
    if (def.type !== "relation") throw new Error("expected relation field def");
    expect(def.source.model).toBe("other-model");
    expect(await def.source.loadOptions("")).toEqual([]);
    expect(await def.source.loadByIds(["x"])).toEqual([]);
  });

  it("passes required through and treats a null description as undefined", () => {
    const def = dataFieldToFieldDef(field({ required: true, description: null }));
    expect(def.required).toBe(true);
    expect(def.description).toBeUndefined();
  });
});

describe("recordDataToDefaultValues", () => {
  const fields: DataFieldForAdapter[] = [
    field({ key: "title", type: "TEXT" }),
    field({ key: "when", type: "DATETIME" }),
    field({ key: "day", type: "DATE" }),
  ];

  it("converts stored ISO date strings into Date instances for DATE/DATETIME fields", () => {
    const result = recordDataToDefaultValues(fields, {
      title: "Launch",
      when: "2026-08-01T15:00:00.000Z",
      day: "2026-08-01",
    });
    expect(result.title).toBe("Launch");
    expect(result.when).toBeInstanceOf(Date);
    expect((result.when as Date).toISOString()).toBe("2026-08-01T15:00:00.000Z");
    expect(result.day).toBeInstanceOf(Date);
  });

  it("passes an already-a-Date value through unchanged", () => {
    const d = new Date("2026-08-01T00:00:00.000Z");
    const result = recordDataToDefaultValues(fields, { when: d, title: "x", day: null });
    expect(result.when).toBe(d);
  });

  it("normalizes null/missing/invalid date values to null", () => {
    const result = recordDataToDefaultValues(fields, { title: "x", when: null, day: "not-a-date" });
    expect(result.when).toBeNull();
    expect(result.day).toBeNull();
  });
});
