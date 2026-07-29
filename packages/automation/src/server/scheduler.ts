import { logger } from "@monark/common";
import { parseGraph } from "../contracts/graph";
import { SCHEDULE_TRIGGER_EVENT } from "../contracts/triggers";
import { nextFireTime, scheduleFromGraph } from "../contracts/schedule";
import {
  claimScheduledFire,
  createPendingRun,
  listDueScheduledAutomations,
  type AutomationRow,
} from "./data";

const SCHEDULER_BATCH_SIZE = 50;

/**
 * The synthetic trigger payload a scheduled run carries — a `DomainEvent`-shaped
 * envelope exposing `{{ trigger.scheduledFor }}` (the instant it was due) and
 * `{{ trigger.firedAt }}` (when the scheduler actually enqueued it).
 */
function schedulePayload(row: AutomationRow, scheduledFor: Date, firedAt: Date) {
  return {
    type: SCHEDULE_TRIGGER_EVENT,
    organizationId: row.organizationId,
    actorId: row.createdBy,
    scheduledFor: scheduledFor.toISOString(),
    firedAt: firedAt.toISOString(),
    occurredAt: firedAt.toISOString(),
  };
}

/**
 * Enqueue a run for every scheduled automation whose next fire is due, advancing
 * each to its following occurrence. The advance is an atomic compare-and-set
 * (`claimScheduledFire`) done *before* enqueueing, so across overlapping ticks
 * and multiple worker processes a fire enqueues exactly one run (a rare enqueue
 * failure loses that one fire rather than duplicating it — the safer mode).
 * Returns the count enqueued. Driven by the worker loop and the
 * `/cron/run-automation-schedules` endpoint.
 */
export async function runDueSchedules(
  now: Date = new Date(),
  batchSize = SCHEDULER_BATCH_SIZE,
): Promise<{ enqueued: number }> {
  const due = await listDueScheduledAutomations(now, batchSize);
  let enqueued = 0;
  for (const row of due) {
    const scheduledFor = row.scheduleNextRunAt;
    if (!scheduledFor) continue;
    const schedule = scheduleFromGraph(parseGraph(row.graph));
    // Trigger node removed / schedule became invalid : stop firing this one.
    if (!schedule) {
      await claimScheduledFire(row.id, scheduledFor, null);
      continue;
    }
    const next = nextFireTime(schedule, now);
    const claimed = await claimScheduledFire(row.id, scheduledFor, next);
    if (!claimed) continue; // another worker took this fire
    try {
      await createPendingRun({
        automationId: row.id,
        organizationId: row.organizationId,
        triggerEventType: row.triggerEventType,
        triggerPayload: schedulePayload(row, scheduledFor, now),
        createdBy: row.createdBy,
      });
      enqueued++;
    } catch (err) {
      logger.error({ err, automationId: row.id }, "automation: scheduled enqueue failed");
    }
  }
  return { enqueued };
}
