import { afterEach, describe, expect, it } from "vitest";
import {
  registerSearchSource,
  listSearchSources,
  _resetSearchRegistryForTesting,
  type SearchSource,
} from "../src/search-registry";

const source = (groupId: string): SearchSource => ({
  module: groupId,
  groupId,
  label: groupId,
  run: async () => [],
});

afterEach(() => _resetSearchRegistryForTesting());

describe("search registry", () => {
  it("registers + lists sources in registration order", () => {
    registerSearchSource(source("wiki"));
    registerSearchSource(source("kanban"));
    expect(listSearchSources().map((s) => s.groupId)).toEqual(["wiki", "kanban"]);
  });

  it("overwrites a re-registered groupId (idempotent across double-imports)", () => {
    registerSearchSource({ ...source("wiki"), label: "first" });
    registerSearchSource({ ...source("wiki"), label: "second" });
    const all = listSearchSources();
    expect(all).toHaveLength(1);
    expect(all[0]!.label).toBe("second");
  });

  it("rejects an invalid groupId", () => {
    expect(() => registerSearchSource(source("Not Valid"))).toThrow(/groupId/i);
    expect(() => registerSearchSource(source(""))).toThrow();
  });
});
