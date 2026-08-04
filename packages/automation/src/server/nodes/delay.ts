import { z } from "zod";
import { defineNode } from "../registry";

/**
 * Pause the flow for a fixed duration, then continue. Durable: the node calls
 * `ctx.suspend`, which records this step as done and re-schedules the run to
 * resume after the delay — so the worker isn't blocked and the pause survives a
 * process restart. Max 24h (the run just waits in the outbox until due).
 */
export const delayNode = defineNode({
  descriptor: {
    kind: "action",
    category: "control",
    label: "Delay",
    description: "Wait a fixed number of seconds, then continue.",
    icon: "Clock",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "delayedSeconds", type: "number", description: "How many seconds the run paused." },
    ],
    configFields: [{ key: "seconds", label: "Delay (seconds)", type: "number", required: true }],
  },
  configSchema: z.object({ seconds: z.coerce.number().int().min(1).max(86_400) }),
  execute: (ctx, config) => {
    ctx.suspend(config.seconds * 1000);
    return Promise.resolve({ delayedSeconds: config.seconds });
  },
});
