import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { t } from "@monark/common/trpc";
import {
  registerSearchSource,
  _resetSearchRegistryForTesting,
  type SearchHit,
} from "@monark/common";
import { searchRouter } from "../../src/server";

// The fan-out needs no database — it aggregates whatever sources are registered.
const createCaller = t.createCallerFactory(searchRouter);
const ctx = { userId: "u1", activeOrganizationId: "o1", requestId: "r1" };

const hit = (id: string): SearchHit => ({ id, title: `hit ${id}`, href: `/x/${id}` });

beforeEach(() => _resetSearchRegistryForTesting());
afterEach(() => _resetSearchRegistryForTesting());

describe("search.global", () => {
  it("fans out across sources and returns non-empty groups", async () => {
    registerSearchSource({
      module: "wiki",
      groupId: "wiki",
      label: "Wiki",
      run: async () => [hit("a")],
    });
    registerSearchSource({
      module: "kanban",
      groupId: "kanban",
      label: "Kanban",
      run: async () => [hit("b"), hit("c")],
    });
    // A source with no matches is dropped from the results.
    registerSearchSource({ module: "cal", groupId: "calendar", label: "Cal", run: async () => [] });

    const result = await createCaller(ctx).global({ query: "hit" });
    expect(result.map((g) => g.groupId).sort()).toEqual(["kanban", "wiki"]);
    expect(result.find((g) => g.groupId === "kanban")?.hits).toHaveLength(2);
  });

  it("isolates a failing source — it contributes nothing, the rest still resolve", async () => {
    registerSearchSource({
      module: "wiki",
      groupId: "wiki",
      label: "Wiki",
      run: async () => [hit("a")],
    });
    registerSearchSource({
      module: "boom",
      groupId: "boom",
      label: "Boom",
      run: async () => {
        throw new Error("source exploded");
      },
    });

    const result = await createCaller(ctx).global({ query: "hit" });
    expect(result.map((g) => g.groupId)).toEqual(["wiki"]);
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(createCaller({ ...ctx, userId: null }).global({ query: "hit" })).rejects.toThrow();
  });

  it("rejects a too-short query at the input boundary", async () => {
    await expect(createCaller(ctx).global({ query: "a" })).rejects.toThrow();
  });
});
