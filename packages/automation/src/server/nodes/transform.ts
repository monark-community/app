import { z } from "zod";
import { tryEvaluateFormula } from "@monark/data-models/contracts";
import { defineNode } from "../registry";

/**
 * Compute a value from a formula. The engine substitutes `{{ trigger.x }}` /
 * `{{ nodeId.y }}` tokens into the expression first, then the shared safe
 * formula evaluator (the same one behind computed Data Model fields) runs it —
 * so it supports arithmetic, comparisons, and the built-in functions
 * (`FORMULA_FUNCTIONS`) but no arbitrary code. Wrap interpolated text operands
 * in quotes, e.g. `CONCAT("Hi ", "{{ trigger.name }}")` ; numbers need no
 * quotes: `{{ trigger.count }} * 2`.
 */
export const transformNode = defineNode({
  descriptor: {
    kind: "action",
    category: "control",
    label: "Transform",
    description: "Compute a value with a safe formula.",
    icon: "FunctionSquare",
    // A value source (no control-flow input) : runs when a downstream node
    // consumes its output. Reference upstream values with {{ }} in the formula.
    inputs: [],
    outputs: [{ id: "out" }],
    configFields: [
      {
        key: "expression",
        label: "Expression",
        type: "textarea",
        required: true,
        placeholder: "{{ trigger.count }} * 2",
        help: "A formula, evaluated after {{ }} substitution. Quote interpolated text operands.",
      },
    ],
  },
  configSchema: z.object({ expression: z.string().min(1).max(2000) }),
  execute: (_ctx, config) => {
    const result = tryEvaluateFormula(config.expression, {});
    if (!result.ok) throw new Error(`Transform formula error: ${result.error}`);
    // A Date result survives as an ISO string in JSON output.
    return Promise.resolve({ value: result.value });
  },
});
