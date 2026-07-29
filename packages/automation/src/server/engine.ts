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
import { getAutomationNode, type NodeExecutionContext } from "./registry";

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

/**
 * Resolve the execution order: the sub-graph reachable from the trigger node,
 * topologically sorted (Kahn's algorithm). Nodes not reachable from a trigger
 * are ignored (dangling palette drops). Throws on a cycle or a missing trigger.
 */
export function executionOrder(graph: AutomationGraph): NodeInstance[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const trigger = graph.nodes.find(
    (n) => getAutomationNode(n.type)?.node.descriptor.kind === "trigger",
  );
  if (!trigger) throw new Error("Automation graph has no trigger node.");

  // Reachable set from the trigger, following edges source -> target.
  const outgoing = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const list = outgoing.get(e.source);
    if (list) list.push(e.target);
    else outgoing.set(e.source, [e.target]);
  }
  const reachable = new Set<string>();
  const stack = [trigger.id];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    for (const next of outgoing.get(id) ?? []) stack.push(next);
  }

  // Pull in pure data-source nodes: a node feeding a `field:` port of a
  // reachable node must also execute (and be ordered before it), even with no
  // control-flow edge into it — e.g. a Constant wired only into a downstream
  // field. So a value source needs no flow-in connection to run.
  let addedSource = true;
  while (addedSource) {
    addedSource = false;
    for (const e of graph.edges) {
      if (
        typeof e.targetHandle === "string" &&
        e.targetHandle.startsWith("field:") &&
        reachable.has(e.target) &&
        byId.has(e.source) &&
        !reachable.has(e.source)
      ) {
        reachable.add(e.source);
        addedSource = true;
      }
    }
  }

  // Kahn's over the induced subgraph.
  const indegree = new Map<string, number>();
  for (const id of reachable) indegree.set(id, 0);
  for (const e of graph.edges) {
    if (reachable.has(e.source) && reachable.has(e.target)) {
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    }
  }
  const queue = [...reachable].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: NodeInstance[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    const node = byId.get(id);
    if (node) order.push(node);
    for (const next of outgoing.get(id) ?? []) {
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

const WHOLE_TOKEN_RE = /^\s*\{\{\s*([\w.]+)\s*\}\}\s*$/;
const EMBEDDED_TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

function interpolateString(value: string, scope: Record<string, unknown>): unknown {
  const whole = value.match(WHOLE_TOKEN_RE);
  if (whole && whole[1]) return resolvePath(scope, whole[1]);
  return value.replace(EMBEDDED_TOKEN_RE, (_m, path: string) => {
    const resolved = resolvePath(scope, path);
    return resolved == null ? "" : String(resolved);
  });
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
  const order = executionOrder(params.graph);
  const inReach = new Set(order.map((n) => n.id));

  // Control-flow incoming edges per node (within the reachable set), each
  // normalized to the source's effective output handle (an edge with no
  // sourceHandle uses the source node's first declared output). Edges into a
  // `field:<key>` target handle are DATA links, not control flow, so they're
  // excluded here and handled separately when resolving config.
  const incoming = new Map<string, Array<{ source: string; handle: string }>>();
  for (const e of params.graph.edges) {
    if (!inReach.has(e.source) || !inReach.has(e.target)) continue;
    if (typeof e.targetHandle === "string" && e.targetHandle.startsWith("field:")) continue;
    const srcNode = getAutomationNode(order.find((n) => n.id === e.source)?.type ?? "");
    const defaultHandle = srcNode?.node.descriptor.outputs[0]?.id ?? "out";
    const handle = e.sourceHandle ?? defaultHandle;
    const list = incoming.get(e.target);
    if (list) list.push({ source: e.source, handle });
    else incoming.set(e.target, [{ source: e.source, handle }]);
  }

  const upstream: Record<string, unknown> = {};
  const activeHandles = new Set<string>(); // `${nodeId}:${handle}`
  const executed = new Set<string>();
  const processed = new Set<string>(); // executed OR skipped (don't re-run)
  let last: unknown = undefined;

  // Resume support: rebuild state from steps already recorded for this run (a
  // prior pass that suspended at a Delay). A SUCCEEDED node's output feeds
  // `upstream` and its outputs re-activate ; a SKIPPED node stays pruned. Both
  // are marked `processed` so they aren't re-run. A caught failure (a FAILED
  // step that recorded active handles — its error output) is treated the same
  // as a success for resume: its `{ error }` output and error handle re-activate
  // so the error branch continues after a delay.
  const priorSteps = await listRunSteps(params.runId);
  for (const step of priorSteps) {
    if (!inReach.has(step.nodeId)) continue;
    processed.add(step.nodeId);
    const caughtFailure = step.status === "FAILED" && step.activeHandles.length > 0;
    if (step.status === "SUCCEEDED" || caughtFailure) {
      executed.add(step.nodeId);
      upstream[step.nodeId] = step.output as unknown;
      last = step.output as unknown;
      // Re-activate exactly the handles the node chose on its first pass (a
      // branch's taken output, not all of them), persisted on the step — so a
      // branch immediately before a Delay resumes only the taken path.
      for (const h of step.activeHandles) activeHandles.add(`${step.nodeId}:${h}`);
    }
  }

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
    // Otherwise every path into it was pruned by a branch, so it's skipped.
    const edgesIn = incoming.get(instance.id) ?? [];
    const shouldRun =
      edgesIn.length === 0 ||
      edgesIn.some((e) => executed.has(e.source) && activeHandles.has(`${e.source}:${e.handle}`));

    if (!shouldRun) {
      await addRunStep({
        runId: params.runId,
        nodeId: instance.id,
        nodeType: instance.type,
        sequence: i,
      }).then((step) => finishRunStep(step.id, { status: "SKIPPED" }));
      continue;
    }

    const scope: Record<string, unknown> = { trigger: params.triggerEvent, ...upstream };
    const resolvedConfig = interpolateConfig(instance.config, scope);

    // Data links: any config variable wired from an upstream node's output
    // (an edge into its `field:<key>` port) takes that output as its value,
    // overriding the typed/interpolated config. Every config field renders a
    // port in the editor, so any of them can be fed this way.
    for (const field of stored.node.descriptor.configFields) {
      const linkEdge = params.graph.edges.find(
        (e) =>
          e.target === instance.id &&
          e.targetHandle === `field:${field.key}` &&
          executed.has(e.source),
      );
      if (linkEdge) resolvedConfig[field.key] = unwrapLinkedValue(upstream[linkEdge.source]);
    }

    const step = await addRunStep({
      runId: params.runId,
      nodeId: instance.id,
      nodeType: instance.type,
      sequence: i,
      input: resolvedConfig,
    });

    let declaredHandles: string[] | null = null;
    let suspendMs: number | null = null;
    // Per-step log buffer. `ctx.log(...)` appends here (capped) ; the lines are
    // persisted with the step on every finish path (success / error-branch /
    // hard-fail) so a node's narration survives however its step ended.
    const logs: AutomationRunStepLog[] = [];
    let logsTruncated = false;
    const appendLog = (message: string, level: AutomationRunStepLogLevel = "info") => {
      if (logs.length >= MAX_STEP_LOGS) {
        logsTruncated = true;
        return;
      }
      logs.push({
        ts: new Date().toISOString(),
        level,
        message:
          message.length > MAX_STEP_LOG_MESSAGE ? message.slice(0, MAX_STEP_LOG_MESSAGE) : message,
      });
    };
    // A stable reference for `finishRunStep` : snapshots the buffer and adds the
    // truncation notice once, so callers pass `stepLogs()` not the live array.
    const stepLogs = (): AutomationRunStepLog[] =>
      logsTruncated
        ? [
            ...logs,
            {
              ts: new Date().toISOString(),
              level: "warn",
              message: `… log truncated at ${MAX_STEP_LOGS} lines`,
            },
          ]
        : logs;
    const ctx: NodeExecutionContext = {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      triggerEvent: params.triggerEvent,
      runId: params.runId,
      automationId: params.automationId,
      upstream,
      log: appendLog,
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
      // Activate the handles the node declared, or all of its outputs by default.
      const outs: string[] = declaredHandles ?? stored.node.descriptor.outputs.map((o) => o.id);
      const active = outs.length > 0 ? outs : ["out"];
      for (const h of active) activeHandles.add(`${instance.id}:${h}`);
      // Persist the chosen handles so a resume (after a delay) re-activates the
      // same branch rather than all outputs.
      await finishRunStep(step.id, {
        status: "SUCCEEDED",
        output,
        activeHandles: active,
        logs: stepLogs(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Error output enabled: catch the failure. The step is recorded FAILED
      // (still visible in history), but instead of aborting the run we expose
      // `{ error }` as the node's output, activate its `error` handle, and let
      // execution continue down the error branch. A node without the error
      // output aborts the run as before.
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
          logs: stepLogs(),
        });
      } else {
        await finishRunStep(step.id, { status: "FAILED", error: message, logs: stepLogs() });
        throw err;
      }
    }

    // The node asked to suspend (Delay): its step is recorded SUCCEEDED and its
    // outputs are active, so on resume it's skipped and downstream continues.
    if (suspendMs !== null) {
      return { status: "suspended", resumeAt: new Date(Date.now() + (suspendMs as number)) };
    }
  }

  return { status: "done", output: last };
}
