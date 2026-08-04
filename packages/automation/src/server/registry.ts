import type { z } from "zod";
import type { DomainEvent } from "@monark/common/contracts/events";
import type { AutomationNodeDescriptor } from "../contracts/nodes";
import type { AutomationRunStepLogLevel } from "../contracts/run";

/** Descriptor metadata a node ships, minus the `type`/`module` the registry derives. */
export type NodeDescriptorMeta = Omit<AutomationNodeDescriptor, "type" | "module">;

/**
 * Runtime context handed to every node's `execute()`. Carries the org, the
 * owner identity the run acts as (privileged nodes re-check this), the
 * triggering event, and the accumulated outputs of already-executed upstream
 * nodes (keyed by `NodeInstance.id`).
 */
export interface NodeExecutionContext {
  organizationId: string;
  /** The automation owner (`Automation.createdBy`) the run executes as. */
  actorUserId: string | null;
  /** The event that triggered the run (or a synthetic payload for a manual run). */
  triggerEvent: DomainEvent;
  runId: string;
  automationId: string;
  /** Outputs of upstream nodes so far, keyed by `NodeInstance.id`. */
  upstream: Record<string, unknown>;
  /**
   * Emit a structured log line for this node's step. Lines are persisted on the
   * step (capped) and shown in the editor's per-node Logs section, so a node can
   * narrate what it did ("resolved recipient", "sent via smtp"). Defaults to the
   * `info` level ; pass `warn` / `error` for a colored line. Purely diagnostic —
   * it never affects control flow (throw to fail a node).
   */
  log: (message: string, level?: AutomationRunStepLogLevel) => void;
  /**
   * Declare which of this node's output handles fire, gating downstream
   * execution (branching). A node that doesn't call this activates ALL its
   * output handles — so single-output action nodes keep their linear behavior.
   * A Condition node calls `activateOutputs(["true"])` to take one branch.
   */
  activateOutputs: (handles: string[]) => void;
  /**
   * Suspend the run for `ms` and resume it later (durable delay). The current
   * node's step is still recorded SUCCEEDED ; the engine stops, the run is
   * re-scheduled to `now + ms`, and on resume the engine skips already-completed
   * nodes and continues downstream. Used by the Delay node.
   */
  suspend: (ms: number) => void;
  /**
   * Resolve one of the run's organization's encrypted secrets by name (env-var
   * style, e.g. `"GITHUB_TOKEN"`), or `null` if the org has no such secret. The
   * plaintext is decrypted from the `@monark/secrets` store on demand and
   * `lastUsedAt` is stamped. SECURITY: never `log()` the returned value, never
   * return it as node output, and never persist it — the resolved config only
   * ever stores the secret's *name*. A node reads a secret only for the duration
   * of its own outbound call.
   */
  getSecret: (name: string) => Promise<string | null>;
}

/**
 * The internal, generic-erased shape stored in the registry. A node author
 * never builds this by hand — {@link defineNode} closes over the typed
 * `configSchema` + `execute` and produces `run`, which parses raw config then
 * executes. This keeps the registry heterogeneous without `any`.
 */
export interface AnyAutomationNode {
  descriptor: NodeDescriptorMeta;
  run: (ctx: NodeExecutionContext, rawConfig: unknown) => Promise<unknown>;
  /**
   * Optional: derive workflow variables this node sets from its output, as a
   * `{ name: value }` map merged into the run's `vars` scope after the node runs
   * (and replayed from the persisted step output on resume, so vars survive a
   * suspend). The generic "set a global variable" seam — the Set Variable node
   * implements it, but any node may. Return `undefined` to set nothing.
   */
  collectVars?: (output: unknown) => Record<string, unknown> | undefined;
}

/**
 * Build a node definition. The typed `execute` receives config already parsed
 * (and thus validated) against `configSchema` ; a config that fails validation
 * throws at run time and fails just that node's step. An optional `collectVars`
 * projects the node's output to the workflow variables it sets (see
 * {@link AnyAutomationNode.collectVars}).
 */
export function defineNode<Config, Output>(def: {
  descriptor: NodeDescriptorMeta;
  configSchema: z.ZodType<Config>;
  execute: (ctx: NodeExecutionContext, config: Config) => Promise<Output>;
  collectVars?: (output: Output) => Record<string, unknown> | undefined;
}): AnyAutomationNode {
  const { collectVars } = def;
  return {
    descriptor: def.descriptor,
    run: (ctx, rawConfig) => def.execute(ctx, def.configSchema.parse(rawConfig)),
    // The engine only ever calls this with THIS node's own output, so the
    // erased `unknown` is safely narrowed back to `Output` at the call.
    ...(collectVars ? { collectVars: (output: unknown) => collectVars(output as Output) } : {}),
  };
}

interface StoredNode {
  type: string;
  module: string;
  node: AnyAutomationNode;
}

// Fully-qualified type (`<module>.<key>`) -> stored node.
const registry = new Map<string, StoredNode>();

const MODULE_RE = /^[a-z][a-z0-9-]*$/;
const KEY_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Register a batch of node types under a module namespace — the extension
 * surface. Any module (core or extended) calls this once at api boot, exactly
 * like `registerPermissions` / `registerEventTypes`. Re-registering a type
 * overwrites it (idempotent across hot-reloads / double-imports).
 */
export function registerAutomationNodes(
  module: string,
  nodes: Record<string, AnyAutomationNode>,
): void {
  if (!MODULE_RE.test(module)) {
    throw new Error(`Invalid automation node module "${module}" (expected ${MODULE_RE}).`);
  }
  for (const [key, node] of Object.entries(nodes)) {
    if (!KEY_RE.test(key)) {
      throw new Error(`Invalid automation node key "${key}" in module "${module}".`);
    }
    const type = `${module}.${key}`;
    registry.set(type, { type, module, node });
  }
}

export function getAutomationNode(type: string): StoredNode | undefined {
  return registry.get(type);
}

/**
 * Project every registered node to its serializable descriptor for the editor
 * palette — the server-only `run`/`execute` never crosses to the client.
 * Sorted by category then label for a stable palette order.
 */
export function listAutomationNodeDescriptors(): AutomationNodeDescriptor[] {
  return [...registry.values()]
    .map(({ type, module, node }) => ({ type, module, ...node.descriptor }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

/** Test hook — clears the registry so a suite can register just its slice. */
export function _resetAutomationNodesForTesting(): void {
  registry.clear();
}
