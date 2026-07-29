import { z } from "zod";
import { defineNode } from "../registry";
import { automationScheduleSchema } from "../../contracts/schedule";

/**
 * A cron-like trigger that runs the flow on a recurring schedule (every N
 * minutes, daily / weekly / monthly at a time, the Nth weekday of a month, …).
 * Its stored `triggerEventType` is the bus-ignored `automation.schedule`
 * sentinel, so it never fires from a platform event — the scheduler enqueues it
 * from `Automation.scheduleNextRunAt`. Like the other triggers, at run time it
 * just exposes the (synthetic) schedule payload for `{{ trigger.* }}`
 * (`firedAt`, `scheduledFor`).
 */
export const scheduledTriggerNode = defineNode({
  descriptor: {
    kind: "trigger",
    category: "trigger",
    label: "Schedule",
    description: "Runs the flow on a recurring schedule (cron-like).",
    icon: "Clock",
    inputs: [],
    outputs: [{ id: "out" }],
    configFields: [{ key: "schedule", label: "Schedule", type: "schedule", required: true }],
  },
  configSchema: z.object({ schedule: automationScheduleSchema }),
  execute: (ctx) => Promise.resolve(ctx.triggerEvent),
});
