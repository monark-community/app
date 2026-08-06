import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@monark/common";
import { automationTools } from "../src/chat/automation-tools";
import type { AppCaller } from "../src/public/caller";

// Each tool's `run` closure delegates to `caller.automation.*`, so a fake
// caller exercises the closures (and `assertGraphValid` / `formatIssue`)
// without a database.
function mockCaller() {
  const automations = {
    list: vi.fn(async () => ({ items: [] as unknown[] })),
    getById: vi.fn(async () => ({ id: "a1", graph: { nodes: [], edges: [] } })),
    create: vi.fn(async () => ({ id: "new", name: "N", enabled: false })),
    update: vi.fn(async () => ({ id: "a1", name: "N2", enabled: true })),
    setEnabled: vi.fn(async () => ({ id: "a1", enabled: true })),
    runNow: vi.fn(async () => ({ runId: "r1" })),
  };
  const nodeTypes = { list: vi.fn(async () => ({ nodes: [] as unknown[] })) };
  const eventTypes = { list: vi.fn(async () => ({ groups: [] as unknown[] })) };
  const runs = { getById: vi.fn(async () => ({ id: "r1", status: "SUCCEEDED", steps: [] })) };
  const caller = {
    automation: { automations, nodeTypes, eventTypes, runs },
  } as unknown as AppCaller;
  return { caller, automations, nodeTypes, eventTypes, runs };
}

const byName = (n: string) => {
  const tool = automationTools.find((t) => t.name === n);
  if (!tool) throw new Error(`tool ${n} not found`);
  return tool;
};

describe("automationTools", () => {
  it("registers the expected tool set with stable names + mutates flags", () => {
    expect(automationTools.map((t) => t.name).sort()).toEqual([
      "automation_create",
      "automation_enable",
      "automation_get",
      "automation_get_run",
      "automation_list",
      "automation_list_node_types",
      "automation_list_trigger_events",
      "automation_test",
      "automation_update",
    ]);
    // Read vs mutate drives the confirm-gate in the chat loop.
    expect(byName("automation_list").mutates).toBe(false);
    expect(byName("automation_get").mutates).toBe(false);
    expect(byName("automation_get_run").mutates).toBe(false);
    expect(byName("automation_list_node_types").mutates).toBe(false);
    expect(byName("automation_list_trigger_events").mutates).toBe(false);
    expect(byName("automation_create").mutates).toBe(true);
    expect(byName("automation_update").mutates).toBe(true);
    expect(byName("automation_enable").mutates).toBe(true);
    expect(byName("automation_test").mutates).toBe(true);
    for (const t of automationTools) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeTruthy();
    }
  });

  it("automation_list maps the paginated result to a compact shape", async () => {
    const m = mockCaller();
    m.automations.list.mockResolvedValueOnce({
      items: [
        {
          id: "a1",
          name: "Flow",
          enabled: true,
          description: "d",
          triggerEventType: "x.y",
          extra: "dropped",
        },
      ],
    });
    const res = await byName("automation_list").run(m.caller, { search: "f", limit: 10 });
    expect(m.automations.list).toHaveBeenCalledWith({ search: "f", limit: 10 });
    expect(res).toEqual([
      { id: "a1", name: "Flow", enabled: true, description: "d", triggerEventType: "x.y" },
    ]);
  });

  it("read tools pass their args straight through to the caller", async () => {
    const m = mockCaller();
    await byName("automation_get").run(m.caller, { id: "a1" });
    expect(m.automations.getById).toHaveBeenCalledWith({ id: "a1" });
    await byName("automation_list_node_types").run(m.caller, {});
    expect(m.nodeTypes.list).toHaveBeenCalled();
    await byName("automation_list_trigger_events").run(m.caller, {});
    expect(m.eventTypes.list).toHaveBeenCalled();
    await byName("automation_get_run").run(m.caller, { runId: "r1" });
    expect(m.runs.getById).toHaveBeenCalledWith({ id: "r1" });
  });

  it("automation_enable / _test forward their args", async () => {
    const m = mockCaller();
    await byName("automation_enable").run(m.caller, { id: "a1", enabled: false });
    expect(m.automations.setEnabled).toHaveBeenCalledWith({ id: "a1", enabled: false });
    await byName("automation_test").run(m.caller, { id: "a1" });
    expect(m.automations.runNow).toHaveBeenCalledWith({ id: "a1" });
  });

  it("automation_create pre-validates the graph and refuses an unrunnable one", async () => {
    // nodeTypes.list → { nodes: [] } so every node type is unknown → a hard error.
    const m = mockCaller();
    const graph = {
      nodes: [{ id: "n1", type: "nope.trigger", position: { x: 0, y: 0 }, config: {}, slug: "s1" }],
      edges: [],
    };
    await expect(
      byName("automation_create").run(m.caller, { name: "New", graph }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.automations.create).not.toHaveBeenCalled();
  });

  it("automation_update without a graph skips validation and forwards the patch", async () => {
    const m = mockCaller();
    const res = await byName("automation_update").run(m.caller, { id: "a1", name: "Renamed" });
    expect(m.nodeTypes.list).not.toHaveBeenCalled();
    expect(m.automations.update).toHaveBeenCalledWith({
      id: "a1",
      name: "Renamed",
      description: undefined,
      graph: undefined,
    });
    expect(res).toEqual({ id: "a1", name: "N2", enabled: true });
  });

  it("automation_update with a graph pre-validates it before patching", async () => {
    const m = mockCaller();
    const graph = {
      nodes: [{ id: "n1", type: "nope", position: { x: 0, y: 0 }, config: {}, slug: "s1" }],
      edges: [],
    };
    await expect(
      byName("automation_update").run(m.caller, { id: "a1", graph }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(m.automations.update).not.toHaveBeenCalled();
  });

  it("input schemas reject malformed input and accept valid input", () => {
    expect(() => byName("automation_list").inputSchema.parse({ limit: 9999 })).toThrow();
    expect(() => byName("automation_get").inputSchema.parse({})).toThrow();
    expect(() => byName("automation_enable").inputSchema.parse({ id: "a1" })).toThrow();
    expect(byName("automation_get").inputSchema.parse({ id: "a1" })).toEqual({ id: "a1" });
  });
});
