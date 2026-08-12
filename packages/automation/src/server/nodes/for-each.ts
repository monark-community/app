import { z } from "zod";
import { defineNode } from "../registry";

/** The registered type of the For-Each loop node, special-cased by the engine. */
export const FOR_EACH_TYPE = "automation.for-each";

/**
 * Iterate a list: run the loop **body** — the sub-graph wired to the `each`
 * output — once per item, then continue on `done`. The engine special-cases
 * this node (its `execute` is never called): it resolves `items` to an array,
 * runs the body per item, and exposes the current item to the body as
 * `{{ steps.<this>.item }}` / `.index` / `.count`. After the loop the node's
 * output is `{ items, count, results }` (`results[i]` = that iteration's last
 * node output), available on the `done` branch as `{{ steps.<this>.results }}`.
 *
 * v1 limits (enforced by the engine + validator): the body runs synchronously
 * within one run pass — no Delay / suspend inside a loop — no nested For-Each in
 * a body, and the list is capped (see MAX_LOOP_ITEMS in engine.ts). A body node
 * with its error-output on still catches per-iteration; an uncaught throw fails
 * the whole loop (and, on retry, re-runs it from the first item).
 */
export const forEachNode = defineNode({
  descriptor: {
    kind: "action",
    category: "control",
    label: "For Each",
    description: "Run the loop body once per item in a list, then continue.",
    icon: "Repeat",
    inputs: [{ id: "in" }],
    outputs: [
      { id: "each", label: "Each item" },
      { id: "done", label: "Done" },
    ],
    outputFields: [
      { key: "item", type: "object", description: "The current item (inside the loop body)." },
      {
        key: "index",
        type: "number",
        description: "The current item's 0-based index (in the body).",
      },
      { key: "count", type: "number", description: "How many items the list has." },
      {
        key: "results",
        type: "object",
        description: "After the loop: each iteration's result, in order.",
      },
    ],
    configFields: [
      {
        key: "items",
        label: "List",
        type: "text",
        required: true,
        placeholder: "{{ steps.find-records.records }}",
        help: "A reference to an array to iterate, e.g. {{ steps.find-records.records }}.",
      },
    ],
  },
  // `items` holds a `{{ }}` reference string in the saved config ; the engine
  // interpolates it to the actual array at run time, so it's unknown here.
  configSchema: z.object({ items: z.unknown() }),
  // The engine runs the loop (see executeGraph); this is never invoked. Present
  // only to satisfy the node contract.
  execute: () => Promise.resolve({}),
});
