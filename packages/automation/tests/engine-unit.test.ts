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

  it("pulls in a value-source referenced via {{ }} (no edge), ordered before it", () => {
    // `c` (Constant) has no edge at all — only a `{{ c.value }}` reference in a's
    // config pulls it into the run and orders it first.
    const g = graph(
      [
        node("t", TRIGGER),
        { id: "a", type: EMAIL, position: at, config: { subject: "{{ c.value }}" } },
        node("c", CONST),
      ],
      [edge("1", "t", "a")],
    );
    const order = ids(g);
    expect(order).toContain("c");
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("a"));
  });

  it("resolves a dependency on a hyphenated node id (the editor mints `n-…`)", () => {
    const g = graph(
      [
        node("t", TRIGGER),
        { id: "a", type: EMAIL, position: at, config: { subject: "{{ n-c.value }}" } },
        { id: "n-c", type: CONST, position: at, config: {} },
      ],
      [edge("1", "t", "a")],
    );
    const order = ids(g);
    expect(order.indexOf("n-c")).toBeLessThan(order.indexOf("a"));
  });

  it("pulls in a value-source referenced by its `{{ steps.<slug> }}` alias", () => {
    // `a` references the Constant by slug, not node id — the slug map must
    // resolve it to `c` and order `c` before `a`.
    const g = graph(
      [
        node("t", TRIGGER),
        { id: "a", type: EMAIL, position: at, config: { subject: "{{ steps.the_const.value }}" } },
        { id: "c", type: CONST, position: at, config: {}, slug: "the_const" },
      ],
      [edge("1", "t", "a")],
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

  it("resolves a reference whose node-id segment contains a hyphen", () => {
    // Editor node ids are hyphenated (`n-…`) ; the path regex must allow `-` or
    // the whole token silently passes through as literal text.
    const s = { "n-1": { value: 42 }, "node-2": { id: "abc" } };
    expect(interpolateConfig({ x: "{{ n-1.value }}" }, s)).toEqual({ x: 42 });
    expect(interpolateConfig({ x: "id {{ node-2.id }}" }, s)).toEqual({ x: "id abc" });
  });

  it("yields undefined for an unknown whole token and empty string when embedded", () => {
    expect(interpolateConfig({ x: "{{ trigger.nope }}" }, scope)).toEqual({ x: undefined });
    expect(interpolateConfig({ x: "a{{ trigger.nope }}b" }, scope)).toEqual({ x: "ab" });
  });

  it("resolves a node output addressed by its `steps.<slug>` alias", () => {
    // Phase 3 addressing : the engine mirrors each upstream output under
    // `steps.<slug>` alongside the raw node-id key.
    const s = {
      trigger: {},
      steps: { find_record: { id: "abc", title: "Hi" } },
      "n-1": { id: "abc" },
    };
    expect(interpolateConfig({ x: "{{ steps.find_record.id }}" }, s)).toEqual({ x: "abc" });
    expect(interpolateConfig({ x: "got {{ steps.find_record.title }}" }, s)).toEqual({
      x: "got Hi",
    });
  });

  it("resolves a workflow variable from the `vars` scope", () => {
    // `{{ vars.<name> }}` is the run-global variable scope a Set Variable node
    // writes ; it resolves like any other path, preserving the value's type.
    const s = { trigger: {}, vars: { rewardTotal: 42, label: "gold" } };
    expect(interpolateConfig({ n: "{{ vars.rewardTotal }}" }, s)).toEqual({ n: 42 });
    expect(interpolateConfig({ s: "tier {{ vars.label }}" }, s)).toEqual({ s: "tier gold" });
  });

  it("passes non-string values through untouched", () => {
    expect(interpolateConfig({ n: 42, b: false, o: { k: 1 } }, scope)).toEqual({
      n: 42,
      b: false,
      o: { k: 1 },
    });
  });
});
