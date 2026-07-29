import type { CSSProperties } from "react";

// Pure run-visualization logic for the automation editor : how a test run's
// per-node statuses map onto edge colors and output-handle dots. Extracted from
// the editor component so it can be unit-tested without mounting React Flow.

export type StepStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

/** The state feeding one node's activeHandles into the viz (a subset). */
export type EdgeViz = { nodeStatus: Map<string, StepStatus>; activeNodeId: string | null };

export type EdgeRunState = "idle" | "pending" | "pulling" | "transmitted" | "error";

/**
 * Map a run's node statuses onto one edge's (source → target) state. Only
 * meaningful while a run is "in play" (some node has a status, or one is
 * active) — at rest every edge is `idle` and keeps its base style, so a resting
 * graph stays calm. A connection goes `transmitted` (green solid) once the
 * *target* has received the input — i.e. the target node has run — not merely
 * when the source finished. This matters for a Delay: the delay marks its own
 * step SUCCEEDED the moment it suspends (so it can resume later), so keying green
 * off the source would green the edge while the delay is still counting down ;
 * keying off the target, the edge out of a delay greens only after the delay
 * elapses and the next node actually runs. While the source is done but the
 * target hasn't received yet (a delay ticking, or the brief gap before the next
 * node lights up) the edge is `pulling` (amber march). Anything touching a
 * failed node is `error` (red) ; an edge into a skipped (untaken-branch) target
 * stays greyed, since nothing was delivered there.
 */
export function edgeRunState(source: string, target: string, viz: EdgeViz): EdgeRunState {
  const runInPlay = viz.nodeStatus.size > 0 || viz.activeNodeId != null;
  if (!runInPlay) return "idle";
  const src = viz.nodeStatus.get(source);
  const tgt = viz.nodeStatus.get(target);
  if (src === "FAILED" || tgt === "FAILED") return "error";
  if (tgt === "SKIPPED") return "pending"; // branch not taken — no delivery
  // Input received by the target → solid green.
  if (tgt === "SUCCEEDED" || tgt === "RUNNING") return "transmitted";
  // Source finished but the target hasn't received yet (delay counting down, or
  // mid-reveal gap), or the target is the node currently lighting up → in transit.
  if (src === "SUCCEEDED" || viz.activeNodeId === target) return "pulling";
  return "pending";
}

// Per-state stroke. Colored solid for terminal states, greyed for waiting. The
// dashed march (pending / pulling) is a CSS class (`automation-edge-flow`) so it
// animates without touching React Flow's own `animated` edge flag.
export const EDGE_STATE_STYLE: Record<
  Exclude<EdgeRunState, "idle">,
  { style: CSSProperties; flow: boolean }
> = {
  pending: {
    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5, opacity: 0.7 },
    flow: true,
  },
  pulling: { style: { stroke: "#f59e0b", strokeWidth: 2 }, flow: true },
  transmitted: { style: { stroke: "#10b981", strokeWidth: 2 }, flow: false },
  error: { style: { stroke: "var(--destructive)", strokeWidth: 2 }, flow: false },
};

/**
 * Colour a flow OUTPUT handle dot by the run. It greens once the node has
 * SUCCEEDED *and* this is a handle it actually fired (its taken branch) — so an
 * output "sent" dot always lights at or before the downstream input "received"
 * dot, never after (execution reaches the downstream node only through a fired
 * upstream handle). The error output keeps its red ; anything not yet fired
 * stays muted.
 */
export function flowOutDotClass(
  runStatus: StepStatus | undefined,
  handleId: string,
  active: Set<string> | undefined,
  isError: boolean,
): string {
  if (isError) return "!bg-destructive";
  // A SUCCEEDED node always activates at least one handle ; treat a missing set
  // as "all fired" so the dot still greens if the data is absent.
  const fired = !active || active.size === 0 || active.has(handleId);
  return runStatus === "SUCCEEDED" && fired ? "!bg-emerald-500" : "!bg-muted-foreground";
}
