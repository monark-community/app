import { describe, expect, it } from "vitest";
import type { AutomationGraph } from "../src/contracts/graph";
import { validateGraph, type ValidatorDescriptor } from "../src/contracts/validate";

// A tiny descriptor set: a trigger with an event-type field, an action with a
// required `to` field, and a no-config passthrough action.
const DESCRIPTORS: Record<string, ValidatorDescriptor> = {
  trigger: { kind: "trigger", configFields: [{ key: "eventType", type: "event-type" }] },
  email: { kind: "action", configFields: [{ key: "to", type: "text", required: true }] },
  noop: { kind: "action", configFields: [] },
};
const descriptorFor = (type: string): ValidatorDescriptor | undefined => DESCRIPTORS[type];

const at = { x: 0, y: 0 };

function graph(
  nodes: AutomationGraph["nodes"],
  edges: AutomationGraph["edges"] = [],
): AutomationGraph {
  return { nodes, edges };
}

describe("validateGraph", () => {
  it("passes a well-formed graph", () => {
    const g = graph(
      [
        { id: "t", type: "trigger", position: at, config: { eventType: "x.happened" } },
        { id: "e", type: "email", position: at, config: { to: "a@b.com" } },
      ],
      [{ id: "1", source: "t", target: "e", sourceHandle: "out", targetHandle: "in" }],
    );
    expect(validateGraph(g, descriptorFor)).toEqual([]);
  });

  it("flags a missing trigger", () => {
    const g = graph([{ id: "e", type: "email", position: at, config: { to: "a@b.com" } }]);
    const issues = validateGraph(g, descriptorFor);
    expect(issues).toContainEqual({ code: "no-trigger", severity: "error" });
  });

  it("flags a trigger with no event selected", () => {
    const g = graph([{ id: "t", type: "trigger", position: at, config: {} }]);
    const issues = validateGraph(g, descriptorFor);
    expect(issues).toContainEqual({
      code: "trigger-no-event",
      severity: "error",
      nodeId: "t",
      fieldKey: "eventType",
    });
  });

  it("treats the trigger event as set when the automation-level event is provided", () => {
    const g = graph([{ id: "t", type: "trigger", position: at, config: {} }]);
    const issues = validateGraph(g, descriptorFor, { triggerEventType: "x.happened" });
    expect(issues.some((i) => i.code === "trigger-no-event")).toBe(false);
  });

  it("flags an unsatisfied required field", () => {
    const g = graph(
      [
        { id: "t", type: "trigger", position: at, config: { eventType: "x" } },
        { id: "e", type: "email", position: at, config: {} },
      ],
      [{ id: "1", source: "t", target: "e", sourceHandle: "out", targetHandle: "in" }],
    );
    const issues = validateGraph(g, descriptorFor);
    expect(issues).toContainEqual({
      code: "missing-required",
      severity: "error",
      nodeId: "e",
      fieldKey: "to",
    });
  });

  it("treats a required field as satisfied when wired", () => {
    const g = graph(
      [
        { id: "t", type: "trigger", position: at, config: { eventType: "x" } },
        { id: "e", type: "email", position: at, config: {} },
      ],
      [{ id: "1", source: "t", target: "e", sourceHandle: "out", targetHandle: "field:to" }],
    );
    expect(validateGraph(g, descriptorFor).some((i) => i.code === "missing-required")).toBe(false);
  });

  it("warns about an orphan node", () => {
    const g = graph([
      { id: "t", type: "trigger", position: at, config: { eventType: "x" } },
      { id: "n", type: "noop", position: at, config: {} },
    ]);
    const issues = validateGraph(g, descriptorFor);
    expect(issues).toContainEqual({ code: "orphan-node", severity: "warning", nodeId: "n" });
  });

  it("detects a cycle", () => {
    const g = graph(
      [
        { id: "t", type: "trigger", position: at, config: { eventType: "x" } },
        { id: "a", type: "noop", position: at, config: {} },
        { id: "b", type: "noop", position: at, config: {} },
      ],
      [
        { id: "1", source: "t", target: "a", sourceHandle: "out", targetHandle: "in" },
        { id: "2", source: "a", target: "b", sourceHandle: "out", targetHandle: "in" },
        { id: "3", source: "b", target: "a", sourceHandle: "out", targetHandle: "in" },
      ],
    );
    expect(validateGraph(g, descriptorFor).some((i) => i.code === "cycle")).toBe(true);
  });

  it("flags an unknown node type", () => {
    const g = graph([{ id: "x", type: "mystery", position: at, config: {} }]);
    const issues = validateGraph(g, descriptorFor);
    expect(issues).toContainEqual({ code: "unknown-node", severity: "error", nodeId: "x" });
  });
});
