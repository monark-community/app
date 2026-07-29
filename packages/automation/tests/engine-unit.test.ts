import { beforeAll, describe, expect, it } from "vitest";
import type { AutomationGraph } from "../src/contracts/graph";
import { executionOrder, interpolateConfig } from "../src/server/engine";
import { registerBuiltinAutomationNodes } from "../src/server/nodes";

// executionOrder resolves node kinds / output handles from the registry, so the
// built-in nodes must be registered first (idempotent).
beforeAll(() => registerBuiltinAutomationNodes());

const at = { x: 0, y: 0 };
const TRIGGER = "automation.event-trigger";
const EMAIL = "automation.send-email";
const NOTIFY = "automation.notification";
const CONST = "automation.constant";

function node(id: string, type: string) {
  return { id, type, position: at, config: {} };
}
function edge(id: string, source: string, target: string, targetHandle?: string) {
  return { id, source, target, sourceHandle: "out", targetHandle: targetHandle ?? "in" };
}
function graph(nodes: AutomationGraph["nodes"], edges: AutomationGraph["edges"]): AutomationGraph {
  return { nodes, edges };
}
const ids = (g: AutomationGraph) => executionOrder(g).map((n) => n.id);

describe("executionOrder", () => {
  it("orders a chain from the trigger downstream", () => {
    const g = graph(
      [node("t", TRIGGER), node("a", EMAIL), node("b", NOTIFY)],
      [edge("1", "t", "a"), edge("2", "a", "b")],
    );
    expect(ids(g)).toEqual(["t", "a", "b"]);
  });

  it("throws when there is no trigger node", () => {
    const g = graph([node("a", EMAIL)], []);
    expect(() => executionOrder(g)).toThrow(/trigger/i);
  });

  it("throws on a cycle", () => {
    const g = graph(
      [node("t", TRIGGER), node("a", EMAIL), node("b", NOTIFY)],
      [edge("1", "t", "a"), edge("2", "a", "b"), edge("3", "b", "a")],
    );
    expect(() => executionOrder(g)).toThrow(/cycle/i);
  });

  it("ignores a node not reachable from the trigger", () => {
    const g = graph([node("t", TRIGGER), node("orphan", NOTIFY)], []);
    expect(ids(g)).toEqual(["t"]);
  });

  it("pulls in a value-source node wired only into a downstream field, ordered before it", () => {
    // `c` (Constant) has no control edge, only a data link into a's `field:subject`.
    const g = graph(
      [node("t", TRIGGER), node("a", EMAIL), node("c", CONST)],
      [edge("1", "t", "a"), edge("2", "c", "a", "field:subject")],
    );
    const order = ids(g);
    expect(order).toContain("c");
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("a"));
  });
});

describe("interpolateConfig", () => {
  const scope = { trigger: { count: 5, name: "Bob", ok: true } };

  it("preserves the raw value's type for a whole-string token", () => {
    expect(interpolateConfig({ n: "{{ trigger.count }}" }, scope)).toEqual({ n: 5 });
    expect(interpolateConfig({ b: "{{ trigger.ok }}" }, scope)).toEqual({ b: true });
  });

  it("stringifies an embedded token into the surrounding text", () => {
    expect(interpolateConfig({ s: "hi {{ trigger.name }}!" }, scope)).toEqual({ s: "hi Bob!" });
  });

  it("resolves a token with no inner whitespace", () => {
    expect(interpolateConfig({ n: "{{trigger.count}}" }, scope)).toEqual({ n: 5 });
  });

  it("yields undefined for an unknown whole token and empty string when embedded", () => {
    expect(interpolateConfig({ x: "{{ trigger.nope }}" }, scope)).toEqual({ x: undefined });
    expect(interpolateConfig({ x: "a{{ trigger.nope }}b" }, scope)).toEqual({ x: "ab" });
  });

  it("passes non-string values through untouched", () => {
    expect(interpolateConfig({ n: 42, b: false, o: { k: 1 } }, scope)).toEqual({
      n: 42,
      b: false,
      o: { k: 1 },
    });
  });
});
