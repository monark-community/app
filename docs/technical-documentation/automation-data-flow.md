# Automation data flow: variables, references, and wiring

Status: accepted design, **fully shipped (phases 1–5).** Phase 1–2: node output schemas ;
the variable picker sources them so upstream fields show without a test run, and
click-to-insert drops a `{{ }}` token at the focused field's cursor. References
were also found to be **silently broken for node ids** (the editor mints
hyphenated ids like `n-a1b2`, but the interpolation regex used `[\w.]`, which
excludes `-`, so a `{{ n-a1b2.field }}` token never resolved) ; the regex now
allows `-`, and `executionOrder` pulls a referenced value source into the run +
orders it before its consumer via a `{{ }}` reference, not only via a `field:`
edge. Phase 4: the data-wire authoring path was **removed** (option a below, not
the option-b sugar this doc originally leaned toward) — no more `field:` ports,
per-field expose toggle, or data edges in the editor ; data flows only through
`{{ }}` references + the picker. Legacy `field:` edges in already-saved graphs
still resolve at run time (the engine keeps that branch) and the editor rewrites
them to references on load, so old automations run unchanged and self-migrate on
the next save. Phase 5: **workflow variables** — a run-global `vars` scope
(`{{ vars.<name> }}`) plus a Set Variable node that writes into it, distinct from
per-step outputs and durable across a suspend. Phase 3: **stable-name
addressing** — every node has a unique, editable slug and its output is addressed
as `{{ steps.<slug>.field }}` (the engine still resolves the legacy `{{ <nodeId> }}`
form, and the editor rewrites old graphs on load). Owner: automation module.
Related: [automation.md](automation.md).

This note settles how an automation node gets the values it runs on: literals,
references to other nodes' output ("global-like variables"), and wired data
connections. It replaces two overlapping, half-finished mechanisms with one
runtime concept plus a proper authoring surface.

## The problem

A node's config field can currently be filled three ways, but at the engine
level there are really only **two runtime paths** plus one that is more
intention than reality:

1. **Literal** ; you type a value into the field.
2. **Reference** (`{{ path }}`) ; [`interpolateConfig`](../../packages/automation/src/server/engine.ts)
   resolves `{{ trigger.x }}` and `{{ <nodeId>.x }}` against a run scope of
   `{ trigger, ...upstreamOutputsByNodeId }`. This is the "global variables"
   idea: every upstream node's output is already globally addressable. It works
   in any string field.
3. **Wired data link** ; an edge into a field's `field:<key>` port. At run time
   the engine sets `resolvedConfig[key] = unwrapLinkedValue(upstream[source])`,
   dumping the **whole** upstream output into that field and overriding the
   typed value.

So "global variables" and "wired connections" are not two features ; they are
two front-ends over the same thing (an upstream node's output). That is the
redundancy. Worse, neither path is complete, and they fail in opposite ways:

- **References are universal in theory, unusable for nodes in practice.**
  `{{ trigger.userId }}` works because `trigger` is a stable name and the
  inspector has an Outputs panel for it. But an upstream node is addressed by
  its **cuid** ; `{{ cms70e6o2002t.recordId }}` is not something a human writes,
  and there is no picker to insert it. So references only really work for the
  trigger.
- **Wires are usable but coarse.** A `field:` wire passes the entire output
  object ; to grab one sub-field you are back to a reference. The
  `unwrapLinkedValue` single-`{ value }` unwrap exists only to paper over this.
- **Node outputs have no declared schema.** The descriptor declares output
  _ports_ (`{ id: "out" }`) but not the _shape_ of what flows out, unlike trigger
  events, which now declare `fields`. The editor cannot build a picker or show
  types for node outputs even if it wanted to.

## Prior art

| Tool              | Data model                                                          | How you address a value                                                           | Insert UX                                                            | Control vs data                                      |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| Unreal Blueprints | typed data **pins**, wired                                          | wire pin to pin ; named variables as Get/Set nodes ; literals on unconnected pins | drag a wire                                                          | fully separate: white exec wire vs colored data pins |
| n8n               | wire carries the item stream (`$json`) ; expressions reach sideways | `{{ $json.x }}`, `{{ $node["Find Record"].json.x }}` — by **name**                | expression editor with autocomplete + drag-from-input-schema         | main line (data + control fused) + expressions       |
| Make              | linear route ; **every field is an expression**                     | click a token (`{{ 2.email }}`, shown with a friendly label)                      | a **mapping panel** lists all upstream outputs, click into any field | route = control ; mapping = data                     |

Two observations. First, all three separate control flow from data flow, which
Monark already does (the flow wire vs `field:` ports). Second, only Unreal wires
individual data values, and it gets away with it because it is strongly typed and
desktop-native. n8n and Make, the closest analogs to Monark, do **not** wire
fields ; every field is an expression, and upstream values come from a **picker**
that lists prior steps by **friendly name** with their **output schema**. The
winning ingredient is the picker + names + declared shapes, not the wiring.

## Decision

Converge on **one runtime concept — references** — and fix the authoring surface,
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
`steps.<slug>` alias (phase 3) — the readable, hand-writable, picker-friendly
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
pure redundancy — a second, coarser way to do what the picker already does
cleanly. Second, keeping wires as sugar (b) still means rendering, hit-testing,
and validating a second port type per field for no capability the picker lacks.
So the editor now has **one** data-authoring surface (references via the picker),
and control-flow wires are the only wires. The engine still resolves any legacy
`field:` edge (backward-compat), and the editor migrates such edges to references
on load ; there is no longer any way to _author_ a data wire.

## Phased implementation

Each phase is independently shippable. Phases 1–2 alone resolve most of the pain
(they make references usable everywhere) without changing wire semantics, so the
direction can be validated before committing to 3–5.

1. **Node output schemas.** Add `AutomationOutputField` to
   [contracts/nodes.ts](../../packages/automation/src/contracts/nodes.ts) and an
   `outputFields` array to the descriptor. Declare outputs on every built-in node
   ([server/nodes/](../../packages/automation/src/server/nodes)). Serialize them
   through `nodeTypes.list`. Pure additive metadata ; no runtime change.

2. **In-field variable picker.** Generalize the trigger Outputs panel in
   [automation-editor.tsx](<../../services/web/src/app/(authed)/automation/[id]/automation-editor.tsx>)
   into an "available data" tree sourced from the trigger fields + every upstream
   node's `outputFields`, resolved by walking the graph backwards from the
   selected node. Click-to-insert the `{{ }}` token into the focused field
   (including mid-text). Keep the trigger Outputs panel behavior as a subset.

3. **Stable name addressing (shipped).** Every node carries a unique, editable
   **slug** ([slug.ts](../../packages/automation/src/contracts/slug.ts),
   `NodeInstance.slug`), derived from its label on creation and de-duplicated. The
   engine mirrors each upstream output under `steps.<slug>` in the resolution
   scope ([engine.ts](../../packages/automation/src/server/engine.ts)) alongside
   the raw node-id key (kept for backward-compat), and `dataDependencies`
   resolves a `{{ steps.<slug> }}` reference back to its node for ordering. The
   editor assigns slugs on load + on drop, enforces uniqueness, offers slug
   editing in the rename dialog (rewriting `{{ steps.<oldslug> }}` references so
   they don't break), emits `{{ steps.<slug> }}` tokens from the picker, and
   rewrites any legacy `{{ <nodeId> }}` reference to slug form on load (a silent
   display migration that self-persists on the next save). Not built: renaming a
   node's display _name_ does not touch its slug (slug is the stable address,
   edited explicitly).

4. **Remove field-wires (option a — shipped).** Drop the data-authoring path
   from the editor entirely: no `field:` ports on the node face, no per-field
   "expose as input" toggle, no data edges. Data comes only from the picker /
   `{{ }}` references. The engine keeps its `field:` resolution branch so
   already-saved graphs run unchanged, and the editor rewrites any legacy
   `field:` edge to an equivalent `{{ source }}` (or `{{ source.value }}` for a
   single-`value` source) reference on load, self-migrating on the next save.
   (`unwrapLinkedValue` is retained only for that legacy-edge runtime path.)

5. **Workflow variables (shipped).** A run-global `vars` scope (`{{ vars.<name> }}`),
   a **Set Variable** node ([set-variable.ts](../../packages/automation/src/server/nodes/set-variable.ts))
   that writes `vars[name] = value`, and picker entries under a "Workflow variables"
   group listing the names any upstream Set Variable node defines. This is the
   literal "global variable" the original design intended, distinct from per-step
   outputs: set it on either arm of a branch and read it after the branches
   converge, or give a value a stable readable name. The write is durable across a
   suspend — the engine rebuilds `vars` on resume by replaying each node's
   `collectVars(output)` from its persisted step (in `sequence` order), a generic
   seam ([registry.ts](../../packages/automation/src/server/registry.ts)) any node
   may implement, not just Set Variable. Computed values (a running total) compose
   with a Transform node feeding the Set Variable's value. Not built: expression
   evaluation inside Set Variable itself (Transform covers it) and per-branch var
   scoping (vars are flat and run-global).

## Consequences

- One runtime path for data ; the redundancy is gone.
- References are usable everywhere via the picker, not just for the trigger —
  including non-text fields (dropdown / switch / number), which get a small
  value↔variable toggle that swaps the native control for a `{{ }}` text box
  (forced on when the stored value is already an expression, so a saved reference
  never vanishes from a dropdown with no matching option). `event-type` and
  `schedule` are excluded (structural).
- Node authors declare outputs once, and every consumer (picker, type hints,
  future validation) benefits, exactly like the event-field metadata.
- The `unwrapLinkedValue` scalar hack is no longer reachable from new authoring ;
  it survives only on the legacy `field:` runtime path for old saved graphs.
- Control-flow wiring is unaffected.

## Non-goals (for now)

- A full expression language (operators, functions). The `{{ path }}` resolver
  stays path-only ; a Transform node covers computed values.
- Strong static type-checking of references. Output `type` is a hint for the
  picker and for soft warnings, not a compiler.
