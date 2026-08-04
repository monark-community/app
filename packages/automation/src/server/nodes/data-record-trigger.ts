import { z } from "zod";
import { defineNode } from "../registry";

/**
 * A resource-scoped trigger for Data Records : fires when a record in a chosen
 * Data Model is created, updated, or deleted. Unlike the generic Event Trigger
 * (which fires for every model's records), this narrows to one model, so the
 * flow only runs for the records the author cares about.
 *
 * On save the editor stores the real `data-models.record-<operation>` bus event
 * as the automation's `triggerEventType` (so matching uses the indexed column) ;
 * the chosen `dataModelKey` stays in this node's config and the run subscriber
 * (`eventScopeMatches`) filters on it — only records in that model enqueue a run.
 * At run time, like the other triggers, it just exposes the triggering event for
 * `{{ trigger.* }}`.
 */
export const dataRecordTriggerNode = defineNode({
  descriptor: {
    kind: "trigger",
    category: "trigger",
    label: "Data Record",
    description:
      "Starts the flow when a record in a chosen Data Model is created, updated, or deleted.",
    icon: "Database",
    inputs: [],
    outputs: [{ id: "out" }],
    configFields: [
      {
        key: "dataModelKey",
        label: "Data model",
        type: "data-model",
        required: true,
        help: "Only records in this model trigger the flow.",
      },
      {
        key: "operation",
        label: "On",
        type: "select",
        required: true,
        options: [
          { value: "created", label: "Record created" },
          { value: "updated", label: "Record updated" },
          { value: "deleted", label: "Record deleted" },
        ],
      },
    ],
  },
  // Lenient like the Event Trigger : `required` is enforced by the graph
  // validator, and a freshly-seeded trigger (empty config) must still parse.
  configSchema: z.object({
    dataModelKey: z.string().optional(),
    operation: z.enum(["created", "updated", "deleted"]).optional(),
  }),
  execute: (ctx) => Promise.resolve(ctx.triggerEvent),
});
