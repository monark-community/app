import { z } from "zod";
import { defineNode } from "../registry";
import { parseJsonValue } from "./shared";

/**
 * Emit a fixed value (string / number / boolean / JSON) for downstream nodes to
 * reference via `{{ nodeId.value }}` or a linked field. Useful as a named
 * constant or a small piece of literal data in a flow.
 */
export const constantNode = defineNode({
  descriptor: {
    kind: "action",
    category: "control",
    label: "Constant",
    description: "Output a fixed value.",
    icon: "Braces",
    // A pure value source : no control-flow input. It runs automatically when a
    // downstream node consumes its output ; wire its output into a field.
    inputs: [],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "value", type: "string", description: "The fixed value you configured." },
    ],
    configFields: [
      {
        key: "valueType",
        label: "Type",
        type: "select",
        required: true,
        options: [
          { value: "text", label: "Text" },
          { value: "number", label: "Number" },
          { value: "boolean", label: "Boolean" },
          { value: "json", label: "JSON" },
        ],
      },
      { key: "value", label: "Value", type: "textarea", required: true },
    ],
  },
  configSchema: z.object({
    valueType: z.enum(["text", "number", "boolean", "json"]),
    value: z.string(),
  }),
  execute: (_ctx, config) => {
    let value: unknown;
    switch (config.valueType) {
      case "number":
        value = Number(config.value);
        break;
      case "boolean":
        value = config.value === "true";
        break;
      case "json":
        value = parseJsonValue(config.value);
        break;
      default:
        value = config.value;
    }
    return Promise.resolve({ value });
  },
});
