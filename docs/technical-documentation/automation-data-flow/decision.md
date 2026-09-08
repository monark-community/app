# Decision

Converge on **one runtime concept (references**) and fix the authoring surface,
instead of maintaining two half-built paths.

- **Control flow stays as wires.** Run order, branching, and error paths are a
  genuinely separate graph. Untouched.
- **Data flow is references.** One resolution mechanism, `{{ path }}`, over a
  clean scope: `{ trigger.*, steps.<name>.*, vars.* }`.
- **A variable picker is the primary authoring surface.** In any field, an
  "insert value" affordance opens a tree of everything available at that point in
  the graph (the trigger's fields plus every upstream node's declared outputs),
  click-to-insert as a `{{ }}` token, mid-text included.
- **Field-wires become sugar that writes a reference** (see the fork below), so
  there is exactly one runtime path and no whole-output coarseness.
- **Nodes declare their output schema**, the same additive-metadata pattern as
  event `fields`, which fuels the picker and kills `unwrapLinkedValue`.

### The scope, precisely

At run time the resolution scope for a node is:

```
{
  trigger: <the triggering event payload>,      // {{ trigger.userId }}
  vars:    { <name>: <value> },                  // {{ vars.rewardAmount }}
  steps:   { <slug>: <that node's output> },     // {{ steps.find_record.recordId }}
  <nodeId>: <that node's output>,                // {{ <nodeId>.recordId }}   (legacy)
}
```

`trigger` and `steps.<slug>` are read-only records of what already ran ; `vars` is
the run-global workflow state. A node's output is addressed by its stable
`steps.<slug>` alias (phase 3) : the readable, hand-writable, picker-friendly
form ; the raw `<nodeId>` key stays in scope so graphs saved before slugs (and any
un-migrated `{{ <nodeId> }}` reference) still resolve. The editor assigns a slug
to every node, keeps it unique, lets the author edit it (rewriting references to
it), and migrates old node-id references to slug form on load.

### The output schema

Each node descriptor gains an `outputFields: AutomationOutputField[]`, mirroring
the event-field shape (`{ key, type, description }`). It describes the node's
output object (the `upstream[nodeId]` value), independent of which handle fired
(the handle gates control flow, not data). A node with its error output enabled
implicitly also exposes an `error` field. Value-source nodes (Constant,
Transform) expose their `value` field explicitly, so the `unwrapLinkedValue`
convention is no longer needed to grab a scalar.

### The field-wire fork

Two viable options for what a `field:` wire means after this change:

- **(a) Remove field-wires (Make model).** All data comes from the picker. Least
  clutter, one path, cleanest mental model. `field:` edges + `unwrapLinkedValue`
  are deleted.
- **(b) Keep field-wires as sugar that writes a reference (chosen).** Dragging a
  node onto a field port sets the field value to `{{ steps.<name> }}` (or opens a
  sub-field sub-picker) ; the wire is a visual rendering of a reference, and the
  runtime resolves only via interpolation. One runtime path, no coarseness, and
  the connect-the-dots affordance people expect from a node graph is preserved.

This doc originally chose **(b)**. In implementation we reversed to **(a),
remove field-wires**, for two reasons that only became clear once phases 1–2
shipped. First, the real blocker was never the wiring model ; it was that node
references were silently broken (the hyphen-regex bug) and had no picker. Once
click-to-insert + output schemas made references usable everywhere, a wire was
pure redundancy : a second, coarser way to do what the picker already does
cleanly. Second, keeping wires as sugar (b) still means rendering, hit-testing,
and validating a second port type per field for no capability the picker lacks.
So the editor now has **one** data-authoring surface (references via the picker),
and control-flow wires are the only wires. The engine still resolves any legacy
`field:` edge (backward-compat), and the editor migrates such edges to references
on load ; there is no longer any way to _author_ a data wire.
