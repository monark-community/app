/**
 * Node-type descriptor contracts, shared between the server registry and the
 * web editor. The server registry (server/registry.ts) pairs each descriptor
 * with a zod `configSchema` + a server-only `execute()` function ; the editor
 * only ever sees this serializable half (there is no `execute` here), fetched
 * via `trpc.automation.nodeTypes.list`.
 *
 * This is the extension surface : any module contributes node types by calling
 * `registerAutomationNodes("<module>", { ... })` at api boot, exactly like
 * `registerPermissions` / `registerEventTypes`.
 */

/** What slot a node fills in a flow. A flow has exactly one `trigger` (entry). */
export type AutomationNodeKind = "trigger" | "action";

/** An input/output port, rendered as a connection handle on the node. */
export interface AutomationNodePort {
  id: string;
  label?: string;
}

/**
 * A config field rendered by the web fields toolkit. Kept intentionally small
 * for the first slice ; grow the `type` union as new nodes need new editors.
 * `event-type`, `user`, and `secret` are pickers backed by dedicated tRPC
 * lookups. A `secret` field stores the secret's *name* (a reference), never its
 * value — the value is resolved server-side at run time via `ctx.getSecret`, so
 * plaintext never reaches the editor or the persisted run config.
 */
export type AutomationNodeConfigFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "event-type"
  | "data-model"
  | "user"
  | "secret"
  | "json"
  | "schedule";

export interface AutomationNodeConfigField {
  key: string;
  label: string;
  type: AutomationNodeConfigFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** Options for a `select` field. */
  options?: Array<{ value: string; label: string }>;
  /**
   * Every config field is a wireable input: the node renders a `field:<key>`
   * target port, and an incoming edge into it feeds the upstream node's output
   * as this field's value at run time (overriding the typed value). Use
   * `{{ nodeId.path }}` interpolation instead to pull a scalar out of an
   * upstream output. `linkable` is retained only as an author hint that a field
   * is object-shaped (e.g. a JSON payload) ; it no longer gates the port.
   */
  linkable?: boolean;
}

/**
 * The serializable half of a node definition — everything the editor needs to
 * render a palette entry, draw its handles, and build its config form.
 */
export interface AutomationNodeDescriptor {
  /** Fully-qualified node-type key, `<module>.<key>` (e.g. "automation.webhook"). */
  type: string;
  /** Owning module (the namespace passed to registerAutomationNodes). */
  module: string;
  kind: AutomationNodeKind;
  /** Palette grouping (e.g. "trigger", "communication", "data", "rbac"). */
  category: string;
  /** Human label (English fallback ; the web layer may i18n built-in nodes). */
  label: string;
  description?: string;
  /** Lucide icon name the editor renders for the node/palette entry. */
  icon?: string;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  configFields: AutomationNodeConfigField[];
}
