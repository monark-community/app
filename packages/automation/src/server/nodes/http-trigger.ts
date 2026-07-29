import { z } from "zod";
import { defineNode } from "../registry";

/**
 * A trigger fired by an inbound HTTP POST to its endpoint
 * (`POST /hooks/automation/:id`, verified by a per-automation secret). The
 * request body becomes the trigger payload, so downstream nodes read it via
 * `{{ trigger.body.* }}`. Its stored `triggerEventType` is a bus-ignored
 * sentinel (`automation.http`), so it never fires from a platform event.
 *
 * `secret` lives in the node config (generated server-side, shown read-only in
 * the editor next to the URL) ; it isn't a user-edited field, hence no
 * `configFields` entry — the editor renders a dedicated endpoint section.
 */
export const httpTriggerNode = defineNode({
  descriptor: {
    kind: "trigger",
    category: "trigger",
    label: "HTTP Trigger",
    description: "Starts the flow when an external system POSTs to its URL.",
    icon: "Webhook",
    inputs: [],
    outputs: [{ id: "out" }],
    configFields: [],
  },
  configSchema: z.object({ secret: z.string().optional() }),
  execute: (ctx) => Promise.resolve(ctx.triggerEvent),
});
