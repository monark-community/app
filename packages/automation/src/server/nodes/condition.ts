import { z } from "zod";
import { defineNode } from "../registry";

const OPERATORS = ["eq", "neq", "contains", "gt", "lt", "gte", "lte", "truthy", "empty"] as const;
type Operator = (typeof OPERATORS)[number];

function evaluate(left: string, operator: Operator, right: string): boolean {
  switch (operator) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "contains":
      return left.includes(right);
    case "gt":
      return Number(left) > Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lte":
      return Number(left) <= Number(right);
    case "truthy":
      return left !== "" && left !== "false" && left !== "0";
    case "empty":
      return left === "";
  }
}

/**
 * Branch the flow. Compares an (interpolated) value against another and
 * activates exactly one output — `true` or `false` — so only the matching
 * downstream path runs. This is the engine's active-handle gating in action:
 * a node reachable only through the un-taken handle is skipped.
 */
export const conditionNode = defineNode({
  descriptor: {
    kind: "action",
    category: "control",
    label: "Condition",
    description: "Take the true or false branch based on a comparison.",
    icon: "GitBranch",
    inputs: [{ id: "in" }],
    outputs: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    outputFields: [
      { key: "result", type: "boolean", description: "Whether the condition matched." },
    ],
    configFields: [
      {
        key: "left",
        label: "Value",
        type: "text",
        required: true,
        placeholder: "{{ trigger.status }}",
      },
      {
        key: "operator",
        label: "Operator",
        type: "select",
        required: true,
        options: [
          { value: "eq", label: "equals" },
          { value: "neq", label: "does not equal" },
          { value: "contains", label: "contains" },
          { value: "gt", label: "greater than" },
          { value: "lt", label: "less than" },
          { value: "gte", label: "greater or equal" },
          { value: "lte", label: "less or equal" },
          { value: "truthy", label: "is truthy" },
          { value: "empty", label: "is empty" },
        ],
      },
      {
        key: "right",
        label: "Compare to",
        type: "text",
        help: "Ignored for is-truthy / is-empty.",
      },
    ],
  },
  configSchema: z.object({
    left: z.string(),
    operator: z.enum(OPERATORS),
    right: z.string().optional(),
  }),
  execute: (ctx, config) => {
    const result = evaluate(config.left, config.operator, config.right ?? "");
    ctx.activateOutputs([result ? "true" : "false"]);
    return Promise.resolve({ result });
  },
});
