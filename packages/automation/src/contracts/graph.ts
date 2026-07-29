import { z } from "zod";

/**
 * The persisted automation graph — exactly what the React Flow editor holds:
 * a list of positioned node instances plus the edges that connect their
 * output handles to downstream input handles. Stored as the `Automation.graph`
 * JSON blob and re-parsed by the execution engine before a run.
 *
 * This is the shared contract between the editor (save/load) and the server
 * engine, so both validate against the same schema.
 */

export const nodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type NodePosition = z.infer<typeof nodePositionSchema>;

/** One placed node. `type` is a registered node-type key (`<module>.<key>`). */
export const nodeInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: nodePositionSchema,
  /** Node-specific config ; validated per-type against its own configSchema. */
  config: z.record(z.string(), z.unknown()).default({}),
  /**
   * Optional per-instance name shown on the node face (e.g. two "Find Records"
   * nodes told apart). Purely editorial ; the engine ignores it.
   */
  name: z.string().optional(),
  /**
   * Config-field keys the author exposed as wireable input ports in the editor.
   * Editor-only presentation state — the engine resolves data links from the
   * edges alone, so this never affects execution. A field with an incoming
   * `field:<key>` edge is always treated as exposed regardless.
   */
  inputs: z.array(z.string()).optional(),
  /**
   * When true, this node has an error output: a thrown failure is caught and
   * routed down edges from its `error` handle (the node's output becomes
   * `{ error }`) instead of aborting the run. Opt-in per node (an advanced
   * setting) ; off by default, so a failure aborts the run as usual.
   */
  errorOutput: z.boolean().optional(),
});
export type NodeInstance = z.infer<typeof nodeInstanceSchema>;

/** A directed connection from one node's output handle to another's input. */
export const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
});
export type Edge = z.infer<typeof edgeSchema>;

export const automationGraphSchema = z.object({
  nodes: z.array(nodeInstanceSchema).default([]),
  edges: z.array(edgeSchema).default([]),
});
export type AutomationGraph = z.infer<typeof automationGraphSchema>;

/** Canonical empty graph — the default for a freshly-created automation. */
export const EMPTY_GRAPH: AutomationGraph = { nodes: [], edges: [] };

/**
 * Parse an unknown JSON value (e.g. the Prisma `Json` column) into a graph,
 * falling back to the empty graph rather than throwing — a stored graph is
 * always trusted-but-defensive on read.
 */
export function parseGraph(value: unknown): AutomationGraph {
  const result = automationGraphSchema.safeParse(value);
  return result.success ? result.data : EMPTY_GRAPH;
}
