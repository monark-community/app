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

/** Value-type hint for an output field, mirrors the event-field type hint. */
export type AutomationOutputFieldType = "string" | "number" | "boolean" | "date" | "object";

/**
 * One field a node exposes on its output object. Declared per node type so the
 * editor's variable picker can list what a node makes available downstream (the
 * same idea as an event's payload `fields`), referenceable as
 * `{{ steps.<node>.<key> }}`. Metadata only ; it does not shape the emitted
 * output. A node with its error output enabled implicitly also exposes `error`.
 */
export interface AutomationOutputField {
  key: string;
  type: AutomationOutputFieldType;
  description: string;
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
   * Vestigial. Data flows via `{{ }}` references now, not per-field wires, so
   * the editor no longer renders a `field:<key>` port and this flag gates
   * nothing. Retained only so already-registered nodes that still pass it
   * type-check ; a runtime engine still resolves any legacy `field:` edge in an
   * old saved graph (see automation-data-flow.md). Do not set it on new nodes.
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
  /**
   * Human label, a canonical English registry string (same class as permission
   * / event-type / flag descriptions), rendered directly by the editor. Node
   * labels are intentionally NOT localized ; add new node labels here in
   * English rather than adding per-node i18n keys. See docs/agents/i18n.md.
   */
  label: string;
  description?: string;
  /** Lucide icon name the editor renders for the node/palette entry. */
  icon?: string;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  /**
   * The fields this node's output object carries, for the editor's variable
   * picker. Optional ; a node that emits nothing useful (or hasn't declared it
   * yet) simply offers no downstream fields. See
   * [automation-data-flow.md](../../../../docs/technical-documentation/automation-data-flow.md).
   */
  outputFields?: AutomationOutputField[];
  configFields: AutomationNodeConfigField[];
}
