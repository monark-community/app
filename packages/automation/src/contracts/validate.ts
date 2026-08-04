import type { AutomationGraph } from "./graph";

/**
 * Pre-flight (pre-run) graph validation, shared by the editor and the server so
 * both apply the identical rules. It's deliberately descriptor-driven and
 * serializable — it reads the `required` flags and node `kind` off the node
 * descriptors (never the server-only zod `configSchema`), so the web editor can
 * run it synchronously for live feedback and the server can run it as a
 * pre-enqueue guard on `runNow`.
 *
 * The deeper per-node zod validation still runs when a node executes ; this is
 * the earlier, structural pass that stops a misconfigured graph from being run
 * at all (and points at the offending node / field).
 */

/** The slice of a node descriptor the validator needs. */
export interface ValidatorDescriptor {
  kind: "trigger" | "action";
  configFields: Array<{ key: string; type: string; required?: boolean }>;
}

export type GraphIssueCode =
  | "no-trigger"
  | "multiple-triggers"
  | "trigger-no-event"
  | "missing-required"
  | "orphan-node"
  | "cycle"
  | "duplicate-slug"
  | "unknown-node";

export type GraphIssueSeverity = "error" | "warning";

export interface GraphIssue {
  code: GraphIssueCode;
  severity: GraphIssueSeverity;
  /** The node the issue concerns ; absent for graph-wide issues (no-trigger, cycle). */
  nodeId?: string;
  /** The config field key, for `missing-required` / `trigger-no-event`. */
  fieldKey?: string;
}

const FIELD_HANDLE_PREFIX = "field:";

/** A config value counts as "unset" when null/blank/empty-array ; `false` / `0` are set. */
function isEmptyConfigValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Validate a graph. Returns every issue found (errors + warnings). An empty
 * array means the graph is runnable. Pass a `descriptorFor` that resolves a
 * node type to its (serializable) descriptor — a Map lookup in the editor, the
 * registry on the server.
 */
export interface ValidateOptions {
  /**
   * The automation's stored trigger event, if known (the server has it ;
   * execution matches on it). When set, it satisfies the trigger-event check
   * even if the trigger node's own `event-type` config field is blank — the two
   * are kept in sync on save, but a graph built outside the editor may only set
   * this. The editor omits it and validates the node config directly.
   */
  triggerEventType?: string | null;
}

export function validateGraph(
  graph: AutomationGraph,
  descriptorFor: (type: string) => ValidatorDescriptor | undefined,
  opts?: ValidateOptions,
): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodes = graph.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Config fields fed by an incoming data link (an edge into `field:<key>`).
  const wired = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (typeof e.targetHandle === "string" && e.targetHandle.startsWith(FIELD_HANDLE_PREFIX)) {
      const key = e.targetHandle.slice(FIELD_HANDLE_PREFIX.length);
      const set = wired.get(e.target);
      if (set) set.add(key);
      else wired.set(e.target, new Set([key]));
    }
  }

  // ── Trigger cardinality ──────────────────────────────────────────────────
  const triggers = nodes.filter((n) => descriptorFor(n.type)?.kind === "trigger");
  if (triggers.length === 0) {
    issues.push({ code: "no-trigger", severity: "error" });
  } else if (triggers.length > 1) {
    for (const trig of triggers) {
      issues.push({ code: "multiple-triggers", severity: "error", nodeId: trig.id });
    }
  }

  // A trigger needs an event to match against : satisfied by the automation's
  // stored triggerEventType (the server passes it) or the trigger node's own
  // `event-type` config field (the editor's source of truth before save).
  const eventFromAutomation =
    typeof opts?.triggerEventType === "string" && opts.triggerEventType.trim() !== "";
  for (const trig of triggers) {
    const eventField = descriptorFor(trig.type)?.configFields.find((f) => f.type === "event-type");
    if (!eventField) continue;
    if (eventFromAutomation || !isEmptyConfigValue(trig.config[eventField.key])) continue;
    issues.push({
      code: "trigger-no-event",
      severity: "error",
      nodeId: trig.id,
      fieldKey: eventField.key,
    });
  }

  // ── Slug uniqueness ───────────────────────────────────────────────────────
  // A node's `{{ steps.<slug> }}` address must be unique, else a reference
  // resolves ambiguously (the engine builds the `steps` map last-wins). The
  // editor prevents duplicates, but a graph created via the API might carry them.
  const slugCounts = new Map<string, number>();
  for (const n of nodes) {
    if (n.slug) slugCounts.set(n.slug, (slugCounts.get(n.slug) ?? 0) + 1);
  }
  for (const n of nodes) {
    if (n.slug && (slugCounts.get(n.slug) ?? 0) > 1) {
      issues.push({ code: "duplicate-slug", severity: "error", nodeId: n.id });
    }
  }

  // ── Per-node: unknown type + unsatisfied required fields ──────────────────
  for (const n of nodes) {
    const desc = descriptorFor(n.type);
    if (!desc) {
      issues.push({ code: "unknown-node", severity: "error", nodeId: n.id });
      continue;
    }
    const wiredKeys = wired.get(n.id) ?? new Set<string>();
    for (const field of desc.configFields) {
      if (!field.required) continue;
      // A trigger's event-type field is covered by the dedicated event check
      // above (which also honors the automation-level triggerEventType) ; don't
      // double-report it here.
      if (desc.kind === "trigger" && field.type === "event-type") continue;
      const satisfied = !isEmptyConfigValue(n.config[field.key]) || wiredKeys.has(field.key);
      if (satisfied) continue;
      issues.push({
        code: "missing-required",
        severity: "error",
        nodeId: n.id,
        fieldKey: field.key,
      });
    }
  }

  // Reachability + cycle only make sense with a trigger to root from ; the
  // no-trigger error already covers the trigger-less case.
  if (triggers.length === 0) return issues;

  const outgoing = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const list = outgoing.get(e.source);
    if (list) list.push(e.target);
    else outgoing.set(e.source, [e.target]);
  }

  // Forward-reachable from the trigger(s), then pull in pure data-source nodes
  // feeding a reachable node's `field:` port (mirrors the engine's execution
  // set, so "orphan" here means "the engine won't run it").
  const reachable = new Set<string>();
  const stack = triggers.map((tr) => tr.id);
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    for (const next of outgoing.get(id) ?? []) stack.push(next);
  }
  let addedSource = true;
  while (addedSource) {
    addedSource = false;
    for (const e of graph.edges) {
      if (
        typeof e.targetHandle === "string" &&
        e.targetHandle.startsWith(FIELD_HANDLE_PREFIX) &&
        reachable.has(e.target) &&
        byId.has(e.source) &&
        !reachable.has(e.source)
      ) {
        reachable.add(e.source);
        addedSource = true;
      }
    }
  }
  for (const n of nodes) {
    if (!reachable.has(n.id)) {
      issues.push({ code: "orphan-node", severity: "warning", nodeId: n.id });
    }
  }

  // ── Cycle over the reachable induced subgraph (Kahn's) ────────────────────
  // NOTE: when loop nodes land, a deliberate back-edge will need exempting here
  // (a loop is only valid with an exit condition) ; today any cycle is an error,
  // matching the engine which throws on one.
  const indegree = new Map<string, number>();
  for (const id of reachable) indegree.set(id, 0);
  for (const e of graph.edges) {
    if (reachable.has(e.source) && reachable.has(e.target)) {
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    }
  }
  const queue = [...reachable].filter((id) => (indegree.get(id) ?? 0) === 0);
  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    processed++;
    for (const next of outgoing.get(id) ?? []) {
      if (!reachable.has(next)) continue;
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (processed < reachable.size) {
    issues.push({ code: "cycle", severity: "error" });
  }

  return issues;
}
