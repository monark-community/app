import { z } from "zod";
import { defineNode } from "../registry";

/**
 * Store a value in a workflow variable, referenceable anywhere downstream as
 * `{{ vars.<name> }}`. Unlike a per-step output (addressed by the node that
 * produced it), a variable is run-global: set it on either arm of a branch and
 * read it after the branches converge without knowing which ran, or give a
 * value a stable, readable name. The value is a literal or a `{{ }}` reference
 * (its resolved type is preserved) ; compute a value first with a Transform node
 * and store its result here. The write is durable — a variable set before a
 * Delay is still in scope when the run resumes (`collectVars` replays it from
 * the persisted step output).
 */
export const setVariableNode = defineNode({
  descriptor: {
    kind: "action",
    category: "control",
    label: "Set Variable",
    description: "Store a value in a workflow variable ({{ vars.name }}).",
    icon: "Variable",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "name", type: "string", description: "The variable name that was set." },
      { key: "value", type: "string", description: "The value stored in the variable." },
    ],
    configFields: [
      {
        key: "name",
        label: "Variable name",
        type: "text",
        required: true,
        placeholder: "rewardTotal",
        help: "Reference it downstream as {{ vars.<name> }}.",
      },
      {
        key: "value",
        label: "Value",
        type: "textarea",
        placeholder: "{{ steps... }} or a literal",
        help: "A literal or a {{ }} reference (its type is preserved). Compute with a Transform node first if needed.",
      },
    ],
  },
  // `value` is `unknown`: the engine interpolates config before this runs, so a
  // `{{ }}` reference may resolve to a number / boolean / object, not just text.
  configSchema: z.object({ name: z.string().min(1), value: z.unknown() }),
  execute: (_ctx, config) => Promise.resolve({ name: config.name, value: config.value ?? null }),
  // The run-global write : this node's output becomes `vars[name] = value`.
  collectVars: (output) => ({ [output.name]: output.value }),
});
