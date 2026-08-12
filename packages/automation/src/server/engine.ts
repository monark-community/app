import type { DomainEvent } from "@monark/common/contracts/events";
import { type AutomationGraph, type NodeInstance } from "../contracts/graph";
import {
  MAX_STEP_LOGS,
  MAX_STEP_LOG_MESSAGE,
  type AutomationRunStepLog,
  type AutomationRunStepLogLevel,
} from "../contracts/run";
import { addRunStep, finishRunStep, listRunSteps } from "./data";
import { getSecretValue } from "@monark/secrets/server";
import { getAutomationNode, type AnyAutomationNode, type NodeExecutionContext } from "./registry";
import { FOR_EACH_TYPE } from "./nodes/for-each";

/** Outcome of executing (or resuming) a graph. */
export type GraphResult =
  | { status: "done"; output: unknown }
  | { status: "suspended"; resumeAt: Date };

/**
 * The per-instance error-output handle. When a node has its error output
 * enabled (`NodeInstance.errorOutput`), a thrown failure is caught: the run
 * continues down edges from this handle instead of aborting, and the node's
 * output becomes `{ error: message }`.
 */
const ERROR_HANDLE = "error";

// For-Each loop handles + guardrails. The `each` output enters the loop body
// (run once per item); the `done` output continues after. See executeGraph.
const LOOP_EACH_HANDLE = "each";
const LOOP_DONE_HANDLE = "done";
const MAX_LOOP_ITEMS = 1000;
const LOOP_SUSPEND_MSG = "Delay / suspend is not supported inside a For Each loop (yet).";

// The first one or two path segments of a `{{ token }}` — either `{{ <nodeId>… }}`
// (the node id, hyphenated e.g. `n-a1b2`) or `{{ steps.<slug>… }}` (the stable
// slug), plus the non-node roots `trigger` / `vars` / `steps`. Used to derive a
// node's data dependencies from its config.
const REFERENCE_RE = /\{\{\s*([\w-]+)(?:\.([\w-]+))?/g;

/** A legacy per-field data edge (into a `field:<key>` port) vs. a control edge. */
function isFieldEdge(targetHandle: string | null | undefined): boolean {
  return typeof targetHandle === "string" && targetHandle.startsWith("field:");
}

function addTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** slug -> node id, for resolving `{{ steps.<slug> }}` references to their node. */
function slugToIdMap(graph: AutomationGraph): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of graph.nodes) if (n.slug) map.set(n.slug, n.id);
  return map;
}

/**
 * The source node id a `{{ }}` reference points at, or null if it's not a node
 * reference (`trigger` / `vars`, or an unknown slug/id). Handles both addressing
 * forms: `{{ steps.<slug>… }}` (resolved via the slug map) and the legacy
 * `{{ <nodeId>… }}`.
 */
function referencedNodeId(
  seg1: string,
  seg2: string | undefined,
  byId: Map<string, NodeInstance>,
  slugToId: Map<string, string>,
): string | null {
  if (seg1 === "steps") return seg2 ? (slugToId.get(seg2) ?? null) : null;
  if (seg1 === "trigger" || seg1 === "vars") return null;
  return byId.has(seg1) ? seg1 : null;
}

/**
 * A node's data dependencies (each `{ source, target }` means source runs first):
 * every node-output reference in the node's config (`{{ steps.<slug>… }}` or the
 * legacy `{{ <nodeId>… }}`), plus any legacy `field:` data edge. This is what
 * pulls a value source (a Constant / Transform referenced only via `{{ }}`, with
 * no control-flow edge) into the run and orders it before its consumer.
 */
function dataDependencies(
  graph: AutomationGraph,
  byId: Map<string, NodeInstance>,
): Array<{ source: string; target: string }> {
  const slugToId = slugToIdMap(graph);
  const edges: Array<{ source: string; target: string }> = [];
  for (const n of graph.nodes) {
    const refs = new Set<string>();
    for (const value of Object.values(n.config ?? {})) {
      if (typeof value !== "string") continue;
      for (const m of value.matchAll(REFERENCE_RE)) {
        if (!m[1]) continue;
        const source = referencedNodeId(m[1], m[2], byId, slugToId);
        if (source && source !== n.id) refs.add(source);
      }
    }
    for (const source of refs) edges.push({ source, target: n.id });
  }
  for (const e of graph.edges) {
    if (isFieldEdge(e.targetHandle) && byId.has(e.source) && byId.has(e.target)) {
      edges.push({ source: e.source, target: e.target });
    }
  }
  return edges;
}

// ── Loop bodies ──────────────────────────────────────────────────────────────

/** A For-Each node's loop body: the sub-graph run once per item. */
interface LoopBody {
  foreachId: string;
  bodyIds: Set<string>;
  /** Body nodes in execution order (topological within the body). */
  order: NodeInstance[];
  /** Control incoming edges *within* the body, for branch gating. */
  incoming: Map<string, Array<{ source: string; handle: string }>>;
}

/** Control adjacency (source -> [{ target, handle }]) over non-`field:` edges. */
function controlAdjacency(
  graph: AutomationGraph,
  byId: Map<string, NodeInstance>,
): Map<string, Array<{ target: string; handle: string }>> {
  const adj = new Map<string, Array<{ target: string; handle: string }>>();
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || isFieldEdge(e.targetHandle)) continue;
    const src = byId.get(e.source);
    const defaultHandle =
      getAutomationNode(src?.type ?? "")?.node.descriptor.outputs[0]?.id ?? "out";
    addTo(adj, e.source, { target: e.target, handle: e.sourceHandle ?? defaultHandle });
  }
  return adj;
}

/** Control-reachable node ids from a set of starts. */
function reachFrom(
  starts: string[],
  adj: Map<string, Array<{ target: string; handle: string }>>,
): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    for (const { target } of adj.get(id) ?? []) stack.push(target);
  }
  return seen;
}

/** Topologically sort a subset of node ids over its internal control + data edges. */
function topoSubset(
  ids: Set<string>,
  byId: Map<string, NodeInstance>,
  adj: Map<string, Array<{ target: string; handle: string }>>,
  depEdges: Array<{ source: string; target: string }>,
): NodeInstance[] {
  const out = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  const seen = new Set<string>();
  const push = (source: string, target: string) => {
    if (!ids.has(source) || !ids.has(target)) return;
    const pair = `${source}->${target}`;
    if (seen.has(pair)) return;
    seen.add(pair);
    addTo(out, source, target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  };
  for (const [source, list] of adj) for (const { target } of list) push(source, target);
  for (const { source, target } of depEdges) push(source, target);
  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: NodeInstance[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    const node = byId.get(id);
    if (node) order.push(node);
    for (const next of out.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== ids.size) throw new Error("Automation loop body has a cycle.");
  return order;
}

/** Control incoming edges *within* a node subset (target -> [{ source, handle }]). */
function incomingWithin(
  ids: Set<string>,
  adj: Map<string, Array<{ target: string; handle: string }>>,
): Map<string, Array<{ source: string; handle: string }>> {
  const inc = new Map<string, Array<{ source: string; handle: string }>>();
  for (const [source, list] of adj) {
    if (!ids.has(source)) continue;
    for (const { target, handle } of list) {
      if (!ids.has(target)) continue;
      addTo(inc, target, { source, handle });
    }
  }
  return inc;
}

/**
 * Every For-Each node's loop body. The body is the sub-graph reachable from the
 * `each` output, minus anything also reachable from `done` (that's after the
 * loop) and minus the For-Each itself — so a body that reconverges with the
 * post-loop flow stays out of the body. Body nodes are excluded from the
 * top-level walk and run internally by the loop (once per item).
 */
function computeLoopBodies(
  graph: AutomationGraph,
  byId: Map<string, NodeInstance>,
  adj: Map<string, Array<{ target: string; handle: string }>>,
): Map<string, LoopBody> {
  const bodies = new Map<string, LoopBody>();
  const deps = dataDependencies(graph, byId);
  for (const f of graph.nodes) {
    if (f.type !== FOR_EACH_TYPE) continue;
    const outs = adj.get(f.id) ?? [];
    const eachTargets = outs.filter((e) => e.handle === LOOP_EACH_HANDLE).map((e) => e.target);
    const doneTargets = outs.filter((e) => e.handle === LOOP_DONE_HANDLE).map((e) => e.target);
    const doneReach = reachFrom(doneTargets, adj);
    const bodyIds = new Set(
      [...reachFrom(eachTargets, adj)].filter((id) => id !== f.id && !doneReach.has(id)),
    );
    const bodyDeps = deps.filter((e) => bodyIds.has(e.source) && bodyIds.has(e.target));
    bodies.set(f.id, {
      foreachId: f.id,
      bodyIds,
      order: topoSubset(bodyIds, byId, adj, bodyDeps),
      incoming: incomingWithin(bodyIds, adj),
    });
  }
  return bodies;
}

/**
 * Resolve the execution order: the sub-graph reachable from the trigger node,
 * topologically sorted (Kahn's algorithm). **Loop-body nodes are excluded** —
 * they run inside their For-Each, not in the top-level walk. Nodes not reachable
 * from a trigger are ignored (dangling palette drops). Throws on a cycle or a
 * missing trigger.
 */
export function executionOrder(graph: AutomationGraph): NodeInstance[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const trigger = graph.nodes.find(
    (n) => getAutomationNode(n.type)?.node.descriptor.kind === "trigger",
  );
  if (!trigger) throw new Error("Automation graph has no trigger node.");

  const adj = controlAdjacency(graph, byId);
  const bodyIds = new Set<string>();
  for (const body of computeLoopBodies(graph, byId, adj).values()) {
    for (const id of body.bodyIds) bodyIds.add(id);
  }

  // Top-level control adjacency: edges between non-body nodes. A For-Each `each`
  // edge has a body target, so it drops out here (the body runs internally).
  const controlOut = new Map<string, string[]>();
  for (const [source, list] of adj) {
    if (bodyIds.has(source)) continue;
    for (const { target } of list) {
      if (!bodyIds.has(target)) addTo(controlOut, source, target);
    }
  }

  const depEdges = dataDependencies(graph, byId).filter(
    (e) => !bodyIds.has(e.source) && !bodyIds.has(e.target),
  );

  // Reachable = control-flow-reachable from the trigger, then transitively pull
  // in every data source a reachable node depends on (a Constant / Transform
  // referenced only via `{{ }}` still needs to run).
  const reachable = new Set<string>();
  const stack = [trigger.id];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    for (const next of controlOut.get(id) ?? []) stack.push(next);
  }
  let added = true;
  while (added) {
    added = false;
    for (const { source, target } of depEdges) {
      if (reachable.has(target) && !reachable.has(source)) {
        reachable.add(source);
        added = true;
      }
    }
  }

  // Kahn's over control + data-dependency edges within the reachable set.
  const orderOut = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of reachable) indegree.set(id, 0);
  const seen = new Set<string>();
  const allEdges = [
    ...[...controlOut.entries()].flatMap(([s, ts]) => ts.map((t) => ({ source: s, target: t }))),
    ...depEdges,
  ];
  for (const { source, target } of allEdges) {
    if (!reachable.has(source) || !reachable.has(target)) continue;
    const pair = `${source}->${target}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    addTo(orderOut, source, target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }
  const queue = [...reachable].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: NodeInstance[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    const node = byId.get(id);
    if (node) order.push(node);
    for (const next of orderOut.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== reachable.size) {
    throw new Error("Automation graph has a cycle.");
  }
  return order;
}

/**
 * When an upstream node's output is wired into a config field, feed the field
 * the useful value: a single-`{ value }` output (the Constant / Transform
 * convention for "a scalar") is unwrapped to that value, so wiring a Constant
 * into a text field yields the text, not `{ value: "…" }`. Multi-key outputs
 * (e.g. `{ records }`, `{ recordId }`) pass through whole ; pull a scalar out
 * of those with a `{{ nodeId.key }}` reference instead.
 */
function unwrapLinkedValue(output: unknown): unknown {
  if (
    output != null &&
    typeof output === "object" &&
    !Array.isArray(output) &&
    Object.keys(output as Record<string, unknown>).length === 1 &&
    "value" in (output as Record<string, unknown>)
  ) {
    return (output as { value: unknown }).value;
  }
  return output;
}

/** Look up a dotted path (e.g. "trigger.recordId") in a scope object. */
function resolvePath(scope: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, scope);
}

/**
 * Interpolate `{{ path }}` tokens in string config values against the run
 * scope (`trigger` + each upstream node's output by id). A whole-string token
 * (`"{{ trigger.count }}"`) yields the raw resolved value (preserving type) ;
 * an embedded token is stringified into the surrounding text. Non-string
 * values pass through untouched. Kept deliberately small for the first slice.
 */
export function interpolateConfig(
  config: Record<string, unknown>,
  scope: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    out[key] = typeof value === "string" ? interpolateString(value, scope) : value;
  }
  return out;
}

// Path chars: word chars, dots (nesting), and hyphens — node ids are hyphenated
// (e.g. `n-a1b2`), so without `-` a `{{ n-a1b2.field }}` reference never matched
// and silently passed through as literal text.
const WHOLE_TOKEN_RE = /^\s*\{\{\s*([\w.-]+)\s*\}\}\s*$/;
const EMBEDDED_TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

function interpolateString(value: string, scope: Record<string, unknown>): unknown {
  const whole = value.match(WHOLE_TOKEN_RE);
  if (whole && whole[1]) return resolvePath(scope, whole[1]);
  return value.replace(EMBEDDED_TOKEN_RE, (_m, path: string) => {
    const resolved = resolvePath(scope, path);
    return resolved == null ? "" : String(resolved);
  });
}

/** Build the per-step log buffer + a snapshot accessor (shared by top-level + loop). */
function makeLogBuffer() {
  const logs: AutomationRunStepLog[] = [];
  let truncated = false;
  const append = (message: string, level: AutomationRunStepLogLevel = "info") => {
    if (logs.length >= MAX_STEP_LOGS) {
      truncated = true;
      return;
    }
    logs.push({
      ts: new Date().toISOString(),
      level,
      message:
        message.length > MAX_STEP_LOG_MESSAGE ? message.slice(0, MAX_STEP_LOG_MESSAGE) : message,
    });
  };
  const snapshot = (): AutomationRunStepLog[] =>
    truncated
      ? [
          ...logs,
          {
            ts: new Date().toISOString(),
            level: "warn",
            message: `… log truncated at ${MAX_STEP_LOGS} lines`,
          },
        ]
      : logs;
  return { append, snapshot };
}

/**
 * Execute a graph for a claimed run: walk the nodes in execution order,
 * recording an `AutomationRunStep` per node, interpolating each node's config
 * against the trigger + upstream outputs, and threading outputs forward.
 * Returns the last node's output. A node throwing aborts the run (the caller —
 * the worker — handles run-level retry/failure) after marking its step failed.
 */
export async function executeGraph(params: {
  runId: string;
  automationId: string;
  organizationId: string;
  actorUserId: string | null;
  triggerEvent: DomainEvent;
  graph: AutomationGraph;
}): Promise<GraphResult> {
  const byIdAll = new Map(params.graph.nodes.map((n) => [n.id, n]));
  const adj = controlAdjacency(params.graph, byIdAll);
  const bodies = computeLoopBodies(params.graph, byIdAll, adj);
  const order = executionOrder(params.graph);
  const inReach = new Set(order.map((n) => n.id));
  // node id -> stable slug, for building the `{{ steps.<slug> }}` scope.
  const slugById = new Map<string, string>();
  for (const n of params.graph.nodes) if (n.slug) slugById.set(n.id, n.slug);

  // Control-flow incoming edges per (top-level) node, normalized to the source's
  // effective output handle. Body nodes aren't in `inReach`, so their edges (a
  // For-Each `each` edge) are excluded here and handled by the loop.
  const incoming = new Map<string, Array<{ source: string; handle: string }>>();
  for (const e of params.graph.edges) {
    if (!inReach.has(e.source) || !inReach.has(e.target)) continue;
    if (typeof e.targetHandle === "string" && e.targetHandle.startsWith("field:")) continue;
    const srcNode = getAutomationNode(order.find((n) => n.id === e.source)?.type ?? "");
    const defaultHandle = srcNode?.node.descriptor.outputs[0]?.id ?? "out";
    addTo(incoming, e.target, { source: e.source, handle: e.sourceHandle ?? defaultHandle });
  }

  const upstream: Record<string, unknown> = {};
  const vars: Record<string, unknown> = {};
  const applyVars = (node: AnyAutomationNode, output: unknown) => {
    const written = node.collectVars?.(output);
    if (written) Object.assign(vars, written);
  };
  const activeHandles = new Set<string>(); // `${nodeId}:${handle}`
  const executed = new Set<string>();
  const processed = new Set<string>(); // executed OR skipped (don't re-run)
  let last: unknown = undefined;
  let seq = 0; // monotonic step sequence (top-level + loop-body steps share it)

  // Resume support: rebuild state from steps already recorded for this run (a
  // prior pass that suspended at a Delay). Only top-level steps matter here —
  // loop-body node ids aren't in `inReach`, so their steps are ignored, and a
  // completed loop is captured by its For-Each step (whose output holds the
  // collected results). A SUCCEEDED node's output feeds `upstream` + re-activates
  // its handles ; a caught failure (FAILED with active handles) is treated the
  // same so its error branch resumes.
  const priorSteps = await listRunSteps(params.runId);
  for (const step of priorSteps) {
    if (!inReach.has(step.nodeId)) continue;
    processed.add(step.nodeId);
    const caughtFailure = step.status === "FAILED" && step.activeHandles.length > 0;
    if (step.status === "SUCCEEDED" || caughtFailure) {
      executed.add(step.nodeId);
      upstream[step.nodeId] = step.output as unknown;
      last = step.output as unknown;
      const priorNode = getAutomationNode(step.nodeType);
      if (priorNode) applyVars(priorNode.node, step.output as unknown);
      for (const h of step.activeHandles) activeHandles.add(`${step.nodeId}:${h}`);
    }
    seq = Math.max(seq, step.sequence + 1);
  }

  // Build the `{{ steps.<slug> }}` mirror + full scope from a given upstream map.
  const buildScope = (up: Record<string, unknown>): Record<string, unknown> => {
    const steps: Record<string, unknown> = {};
    for (const [nid, out] of Object.entries(up)) {
      const slug = slugById.get(nid);
      if (slug) steps[slug] = out;
    }
    return { trigger: params.triggerEvent, vars, steps, ...up };
  };

  // Run a For-Each loop body once, for one item. The current item is exposed to
  // the body as the For-Each node's output (`{{ steps.<foreach>.item/.index }}`).
  // Returns the last-executed body node's output (this iteration's result).
  // Suspend inside a body is rejected (v1) ; an uncaught body failure throws
  // (aborting the whole run, which then retries the loop from the first item).
  const runLoopBody = async (body: LoopBody, iterationOutput: Record<string, unknown>) => {
    const bodyUpstream: Record<string, unknown> = {
      ...upstream,
      [body.foreachId]: iterationOutput,
    };
    const bodyActive = new Set<string>();
    const bodyExecuted = new Set<string>();
    let terminal: unknown = undefined;
    for (const bn of body.order) {
      const stored = getAutomationNode(bn.type);
      if (!stored) throw new Error(`Unknown node type "${bn.type}" in loop body.`);
      if (stored.node.descriptor.kind === "trigger" || bn.type === FOR_EACH_TYPE) {
        throw new Error(
          bn.type === FOR_EACH_TYPE
            ? "A For Each body can't contain a nested loop (yet)."
            : "A For Each body can't contain a trigger.",
        );
      }
      const edgesIn = body.incoming.get(bn.id) ?? [];
      const shouldRun =
        edgesIn.length === 0 ||
        edgesIn.some(
          (e) => bodyExecuted.has(e.source) && bodyActive.has(`${e.source}:${e.handle}`),
        );
      if (!shouldRun) {
        await addRunStep({
          runId: params.runId,
          nodeId: bn.id,
          nodeType: bn.type,
          sequence: seq++,
        }).then((s) => finishRunStep(s.id, { status: "SKIPPED" }));
        continue;
      }
      const resolvedConfig = interpolateConfig(bn.config, buildScope(bodyUpstream));
      const step = await addRunStep({
        runId: params.runId,
        nodeId: bn.id,
        nodeType: bn.type,
        sequence: seq++,
        input: resolvedConfig,
      });
      const { append, snapshot } = makeLogBuffer();
      let declaredHandles: string[] | null = null;
      let suspended = false;
      const ctx: NodeExecutionContext = {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        triggerEvent: params.triggerEvent,
        runId: params.runId,
        automationId: params.automationId,
        upstream: bodyUpstream,
        log: append,
        activateOutputs: (handles) => {
          declaredHandles = handles;
        },
        suspend: () => {
          suspended = true;
        },
        getSecret: (name) => getSecretValue(params.organizationId, name),
      };
      try {
        const output = await stored.node.run(ctx, resolvedConfig);
        if (suspended) throw new Error(LOOP_SUSPEND_MSG);
        bodyUpstream[bn.id] = output;
        bodyExecuted.add(bn.id);
        terminal = output;
        applyVars(stored.node, output);
        const outs = declaredHandles ?? stored.node.descriptor.outputs.map((o) => o.id);
        const active = outs.length > 0 ? outs : ["out"];
        for (const h of active) bodyActive.add(`${bn.id}:${h}`);
        await finishRunStep(step.id, {
          status: "SUCCEEDED",
          output,
          activeHandles: active,
          logs: snapshot(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (bn.errorOutput && !suspended) {
          const output = { error: message };
          bodyUpstream[bn.id] = output;
          bodyExecuted.add(bn.id);
          terminal = output;
          bodyActive.add(`${bn.id}:${ERROR_HANDLE}`);
          await finishRunStep(step.id, {
            status: "FAILED",
            error: message,
            output,
            activeHandles: [ERROR_HANDLE],
            logs: snapshot(),
          });
        } else {
          await finishRunStep(step.id, { status: "FAILED", error: message, logs: snapshot() });
          throw err;
        }
      }
    }
    return terminal;
  };

  for (let i = 0; i < order.length; i++) {
    const instance = order[i];
    if (!instance) continue;
    if (processed.has(instance.id)) continue; // already done on a prior pass
    const stored = getAutomationNode(instance.type);
    if (!stored) {
      throw new Error(`Unknown node type "${instance.type}" in automation ${params.automationId}.`);
    }

    // A node runs iff it's a root (no incoming edges — the trigger) or at least
    // one incoming edge comes from an already-executed node's ACTIVE handle.
    const edgesIn = incoming.get(instance.id) ?? [];
    const shouldRun =
      edgesIn.length === 0 ||
      edgesIn.some((e) => executed.has(e.source) && activeHandles.has(`${e.source}:${e.handle}`));

    if (!shouldRun) {
      await addRunStep({
        runId: params.runId,
        nodeId: instance.id,
        nodeType: instance.type,
        sequence: seq++,
      }).then((step) => finishRunStep(step.id, { status: "SKIPPED" }));
      continue;
    }

    const resolvedConfig = interpolateConfig(instance.config, buildScope(upstream));

    // Data links: any config variable wired from an upstream node's output.
    for (const field of stored.node.descriptor.configFields) {
      const linkEdge = params.graph.edges.find(
        (e) =>
          e.target === instance.id &&
          e.targetHandle === `field:${field.key}` &&
          executed.has(e.source),
      );
      if (linkEdge) resolvedConfig[field.key] = unwrapLinkedValue(upstream[linkEdge.source]);
    }

    // ── For-Each: run the loop body once per item, then continue on `done`. ──
    if (instance.type === FOR_EACH_TYPE) {
      const body = bodies.get(instance.id);
      const itemsRaw = resolvedConfig.items;
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      const step = await addRunStep({
        runId: params.runId,
        nodeId: instance.id,
        nodeType: instance.type,
        sequence: seq++,
        input: { count: items.length },
      });
      try {
        if (!Array.isArray(itemsRaw)) {
          throw new Error("For Each: the List did not resolve to an array.");
        }
        if (items.length > MAX_LOOP_ITEMS) {
          throw new Error(`For Each: too many items (${items.length}; max ${MAX_LOOP_ITEMS}).`);
        }
        const results: unknown[] = [];
        if (body) {
          for (let idx = 0; idx < items.length; idx++) {
            results.push(
              await runLoopBody(body, { item: items[idx], index: idx, count: items.length }),
            );
          }
        }
        const output = { items, count: items.length, results };
        upstream[instance.id] = output;
        last = output;
        executed.add(instance.id);
        activeHandles.add(`${instance.id}:${LOOP_DONE_HANDLE}`);
        await finishRunStep(step.id, {
          status: "SUCCEEDED",
          output,
          activeHandles: [LOOP_DONE_HANDLE],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await finishRunStep(step.id, { status: "FAILED", error: message });
        throw err;
      }
      continue;
    }

    const step = await addRunStep({
      runId: params.runId,
      nodeId: instance.id,
      nodeType: instance.type,
      sequence: seq++,
      input: resolvedConfig,
    });

    const { append, snapshot } = makeLogBuffer();
    let declaredHandles: string[] | null = null;
    let suspendMs: number | null = null;
    const ctx: NodeExecutionContext = {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      triggerEvent: params.triggerEvent,
      runId: params.runId,
      automationId: params.automationId,
      upstream,
      log: append,
      activateOutputs: (handles) => {
        declaredHandles = handles;
      },
      suspend: (ms) => {
        suspendMs = ms;
      },
      getSecret: (name) => getSecretValue(params.organizationId, name),
    };

    try {
      const output = await stored.node.run(ctx, resolvedConfig);
      upstream[instance.id] = output;
      last = output;
      executed.add(instance.id);
      applyVars(stored.node, output);
      const outs: string[] = declaredHandles ?? stored.node.descriptor.outputs.map((o) => o.id);
      const active = outs.length > 0 ? outs : ["out"];
      for (const h of active) activeHandles.add(`${instance.id}:${h}`);
      await finishRunStep(step.id, {
        status: "SUCCEEDED",
        output,
        activeHandles: active,
        logs: snapshot(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (instance.errorOutput) {
        const output = { error: message };
        upstream[instance.id] = output;
        last = output;
        executed.add(instance.id);
        activeHandles.add(`${instance.id}:${ERROR_HANDLE}`);
        await finishRunStep(step.id, {
          status: "FAILED",
          error: message,
          output,
          activeHandles: [ERROR_HANDLE],
          logs: snapshot(),
        });
      } else {
        await finishRunStep(step.id, { status: "FAILED", error: message, logs: snapshot() });
        throw err;
      }
    }

    if (suspendMs !== null) {
      return { status: "suspended", resumeAt: new Date(Date.now() + (suspendMs as number)) };
    }
  }

  return { status: "done", output: last };
}
