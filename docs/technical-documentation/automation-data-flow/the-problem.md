# The problem

A node's config field can currently be filled three ways, but at the engine
level there are really only **two runtime paths** plus one that is more
intention than reality:

1. **Literal** ; you type a value into the field.
2. **Reference** (`{{ path }}`) ; [`interpolateConfig`](../../../packages/automation/src/server/engine.ts)
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
