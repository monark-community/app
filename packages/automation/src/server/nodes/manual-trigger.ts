import { z } from "zod";
import { defineNode } from "../registry";

/**
 * A trigger that runs only on demand — the "Run now" button — and never from a
 * platform event. Its stored `triggerEventType` is a bus-ignored sentinel
 * (`automation.manual`), so the event subscriber never enqueues it. At run time
 * its only job, like the event trigger, is to expose the (synthetic) trigger
 * payload as its output for `{{ trigger.* }}`.
 */
export const manualTriggerNode = defineNode({
  descriptor: {
    kind: "trigger",
    category: "trigger",
    label: "Manual Trigger",
    description: "Starts the flow only when you press Run — never from an event.",
    icon: "MousePointerClick",
    inputs: [],
    outputs: [{ id: "out" }],
    configFields: [],
  },
  configSchema: z.object({}),
  execute: (ctx) => Promise.resolve(ctx.triggerEvent),
});
