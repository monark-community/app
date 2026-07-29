import { describe, expect, it } from "vitest";
import {
  edgeRunState,
  flowOutDotClass,
  type EdgeViz,
  type StepStatus,
} from "@/app/(authed)/automation/[id]/run-viz";

// Build a viz from a { nodeId: status } map plus an optional active node.
function viz(statuses: Record<string, StepStatus>, activeNodeId: string | null = null): EdgeViz {
  return { nodeStatus: new Map(Object.entries(statuses)), activeNodeId };
}

describe("edgeRunState", () => {
  it("is idle when no run is in play", () => {
    expect(edgeRunState("a", "b", viz({}))).toBe("idle");
  });

  it("greens (transmitted) only once the TARGET has received the input", () => {
    // Source done, target not yet run → still in transit, not green.
    expect(edgeRunState("a", "b", viz({ a: "SUCCEEDED" }))).toBe("pulling");
    // Target ran → received → green.
    expect(edgeRunState("a", "b", viz({ a: "SUCCEEDED", b: "SUCCEEDED" }))).toBe("transmitted");
    expect(edgeRunState("a", "b", viz({ a: "SUCCEEDED", b: "RUNNING" }))).toBe("transmitted");
  });

  it("keeps the edge out of a delay non-green until the delay elapses", () => {
    // Delay `d` has SUCCEEDED (it suspends by marking its step done) and is the
    // active/waiting frontier ; downstream `n` has not run yet → amber, NOT green.
    expect(edgeRunState("d", "n", viz({ d: "SUCCEEDED" }, "d"))).toBe("pulling");
    // After the delay, the downstream node runs → the edge greens.
    expect(edgeRunState("d", "n", viz({ d: "SUCCEEDED", n: "SUCCEEDED" }, null))).toBe(
      "transmitted",
    );
  });

  it("marks anything touching a failed node as error", () => {
    expect(edgeRunState("a", "b", viz({ a: "FAILED" }))).toBe("error");
    expect(edgeRunState("a", "b", viz({ a: "SUCCEEDED", b: "FAILED" }))).toBe("error");
  });

  it("greys an edge into a skipped (untaken-branch) target", () => {
    expect(edgeRunState("a", "b", viz({ a: "SUCCEEDED", b: "SKIPPED" }))).toBe("pending");
  });

  it("pulls toward the node currently lighting up", () => {
    // Target is the active node, source not yet resolved.
    expect(edgeRunState("a", "b", viz({ x: "SUCCEEDED" }, "b"))).toBe("pulling");
  });

  it("is pending for an edge still ahead of the frontier", () => {
    expect(edgeRunState("a", "b", viz({ x: "SUCCEEDED" }, "x"))).toBe("pending");
  });
});

describe("flowOutDotClass", () => {
  const GREEN = "!bg-emerald-500";
  const MUTED = "!bg-muted-foreground";
  const RED = "!bg-destructive";

  it("greens a fired output on a succeeded node", () => {
    expect(flowOutDotClass("SUCCEEDED", "out", new Set(["out"]), false)).toBe(GREEN);
  });

  it("greens only the branch that actually fired", () => {
    const active = new Set(["true"]);
    expect(flowOutDotClass("SUCCEEDED", "true", active, false)).toBe(GREEN);
    expect(flowOutDotClass("SUCCEEDED", "false", active, false)).toBe(MUTED);
  });

  it("keeps the error output red regardless of status", () => {
    expect(flowOutDotClass(undefined, "error", undefined, true)).toBe(RED);
    expect(flowOutDotClass("FAILED", "error", new Set(["error"]), true)).toBe(RED);
  });

  it("stays muted before the node has run, and for a non-succeeded node", () => {
    expect(flowOutDotClass(undefined, "out", undefined, false)).toBe(MUTED);
    expect(flowOutDotClass("RUNNING", "out", undefined, false)).toBe(MUTED);
    expect(flowOutDotClass("FAILED", "out", new Set(), false)).toBe(MUTED);
  });

  it("greens on a succeeded node when the active-handle set is missing (fallback)", () => {
    expect(flowOutDotClass("SUCCEEDED", "out", undefined, false)).toBe(GREEN);
  });
});
