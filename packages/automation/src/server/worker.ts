import { emit, logger } from "@monark/common";
import type { DomainEvent } from "@monark/common/contracts/events";
import { parseGraph } from "../contracts/graph";
import type {
  AutomationRunFailedEvent,
  AutomationRunStartedEvent,
  AutomationRunSucceededEvent,
} from "../contracts/events";
import {
  claimRun,
  findAutomationById,
  listPendingDueRuns,
  listRunSteps,
  markRunFailed,
  markRunForResume,
  markRunForRetry,
  markRunSucceeded,
  type AutomationRunRow,
} from "./data";
import { executeGraph } from "./engine";
import { runDueSchedules } from "./scheduler";

export const AUTOMATION_WORKER_INTERVAL_MS = 5_000;
const WORKER_BATCH_SIZE = 25;
/** Attempts (including the first) before a run is dead-lettered to FAILED. */
export const AUTOMATION_MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 5 * 60_000;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

export function startAutomationWorker(options?: { intervalMs?: number; batchSize?: number }): void {
  if (timer) return;
  const interval = options?.intervalMs ?? AUTOMATION_WORKER_INTERVAL_MS;
  const batchSize = options?.batchSize ?? WORKER_BATCH_SIZE;
  timer = setInterval(() => {
    // Enqueue any due scheduled (cron-like) triggers first, then drain the run
    // outbox — so a fire runs within the same tick it's enqueued.
    void (async () => {
      try {
        await runDueSchedules();
      } catch (err) {
        logger.error({ err }, "automation scheduler tick failed");
      }
      await automationTick(batchSize);
    })();
  }, interval);
  // Don't keep the event loop alive for the worker alone (test / dev exit).
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs: interval, batchSize }, "automation worker started");
}

export function stopAutomationWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Drain a batch of due PENDING runs. The `inFlight` guard prevents overlapping
 * ticks within a process ; the atomic `claimRun` guard makes it safe across
 * processes. Exposed for the integration tests + an external cron fallback.
 */
export async function automationTick(
  batchSize = WORKER_BATCH_SIZE,
): Promise<{ processed: number }> {
  if (inFlight) return { processed: 0 };
  inFlight = true;
  try {
    const due = await listPendingDueRuns(batchSize);
    let processed = 0;
    for (const run of due) {
      const claimed = await claimRun(run.id);
      if (!claimed) continue;
      await executeRun(claimed);
      processed++;
    }
    return { processed };
  } finally {
    inFlight = false;
  }
}

function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
}

/** Execute (or resume) one claimed run. */
async function executeRun(run: AutomationRunRow): Promise<void> {
  const startedAt = Date.now();
  const automation = await findAutomationById(run.automationId);
  if (!automation || automation.deletedAt) {
    await markRunFailed(run.id, "Automation not found or deleted.");
    return;
  }

  // Only emit run-started on the first execution, not on a delay resume.
  const isResume = (await listRunSteps(run.id)).length > 0;
  if (!isResume) {
    await emit<AutomationRunStartedEvent>({
      type: "automation.run-started",
      automationId: run.automationId,
      runId: run.id,
      organizationId: run.organizationId,
      triggerEventType: run.triggerEventType,
      occurredAt: new Date(),
    }).catch(() => {});
  }

  try {
    const result = await executeGraph({
      runId: run.id,
      automationId: run.automationId,
      organizationId: run.organizationId,
      actorUserId: run.createdBy,
      // The stored trigger payload is a prior DomainEvent (or a synthetic
      // manual payload) — safe to hand back to the engine as the trigger.
      triggerEvent: run.triggerPayload as unknown as DomainEvent,
      graph: parseGraph(automation.graph),
    });
    if (result.status === "suspended") {
      // A Delay node paused the run ; re-schedule it to resume, without counting
      // it as a retry.
      await markRunForResume(run.id, result.resumeAt);
      return;
    }
    await markRunSucceeded(run.id, result.output);
    await emit<AutomationRunSucceededEvent>({
      type: "automation.run-succeeded",
      automationId: run.automationId,
      runId: run.id,
      organizationId: run.organizationId,
      triggerEventType: run.triggerEventType,
      durationMs: Date.now() - startedAt,
      occurredAt: new Date(),
    }).catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // `attempts` counts failures ; claimRun no longer bumps it, so increment here.
    const attempts = run.attempts + 1;
    if (attempts < AUTOMATION_MAX_ATTEMPTS) {
      const nextAttemptAt = new Date(Date.now() + backoffMs(attempts));
      await markRunForRetry(run.id, message, nextAttemptAt, attempts);
      logger.warn({ runId: run.id, attempts, err }, "automation run failed; scheduled retry");
    } else {
      await markRunFailed(run.id, message);
      await emit<AutomationRunFailedEvent>({
        type: "automation.run-failed",
        automationId: run.automationId,
        runId: run.id,
        organizationId: run.organizationId,
        triggerEventType: run.triggerEventType,
        error: message,
        occurredAt: new Date(),
      }).catch(() => {});
      logger.error({ runId: run.id, err }, "automation run failed permanently");
    }
  }
}
