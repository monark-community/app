import { z } from "zod";
import { defineNode } from "../registry";

/**
 * The flow entry point. A flow has exactly one trigger ; it's bound to a domain
 * event type (matched by the subscriber before the run is ever enqueued), so at
 * run time its only job is to expose the triggering event as its output, which
 * downstream nodes reference via `{{ trigger.* }}`.
 */
export const eventTriggerNode = defineNode({
  descriptor: {
    kind: "trigger",
    category: "trigger",
    label: "Event Trigger",
    description: "Starts the flow when a matching platform event fires.",
    icon: "Zap",
    inputs: [],
    outputs: [{ id: "out" }],
    configFields: [
      {
        key: "eventType",
        label: "When this event fires",
        type: "event-type",
        required: true,
        help: "The domain event that starts this automation.",
      },
    ],
  },
  // `eventType` drives matching at enqueue time (Automation.triggerEventType),
  // not execution — so it's optional here: a freshly-seeded trigger (empty
  // config) and manual runs must still execute.
  configSchema: z.object({ eventType: z.string().optional() }),
  execute: (ctx) => Promise.resolve(ctx.triggerEvent),
});
