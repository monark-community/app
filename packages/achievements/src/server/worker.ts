// Side-effect import : activates the "achievements.awarded" notification-kind
// registry augmentation so `notify(...)` below is typed.
import "../contracts/notifications";
import { emit, logger } from "@monark/common";
import { notify } from "@monark/notifications/server";
import { recipientsFor, type AchievementMatch, type EventLike } from "../contracts/matching";
import type { AchievementsAwardedEvent } from "../contracts/events";
import {
  awardIfAbsent,
  claimOutboxBatch,
  filterHumanUserIds,
  getEnabledRulesForEvent,
  incrementProgress,
  markOutboxDone,
  markOutboxRetryOrFail,
  type AchievementOutboxRow,
} from "./data";

export const ACHIEVEMENTS_WORKER_INTERVAL_MS = 5_000;
const WORKER_BATCH_SIZE = 50;
/** Attempts (including the first) before an outbox row is dead-lettered. */
export const ACHIEVEMENTS_MAX_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 60_000;
const RETRY_BACKOFF_MS = 15_000;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

export function startAchievementsWorker(options?: {
  intervalMs?: number;
  batchSize?: number;
}): void {
  if (timer) return;
  const interval = options?.intervalMs ?? ACHIEVEMENTS_WORKER_INTERVAL_MS;
  const batchSize = options?.batchSize ?? WORKER_BATCH_SIZE;
  timer = setInterval(() => {
    void achievementsTick(batchSize).catch((err) =>
      logger.error({ err }, "achievements worker tick failed"),
    );
  }, interval);
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs: interval, batchSize }, "achievements worker started");
}

export function stopAchievementsWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Drain a batch of due outbox rows. The `inFlight` guard prevents overlapping
 * ticks in one process ; the leased `claimOutboxBatch` guard makes it safe
 * across processes. Exposed for the integration tests + an external cron
 * fallback.
 */
export async function achievementsTick(
  batchSize = WORKER_BATCH_SIZE,
): Promise<{ processed: number }> {
  if (inFlight) return { processed: 0 };
  inFlight = true;
  try {
    const rows = await claimOutboxBatch(batchSize, CLAIM_LEASE_MS);
    let processed = 0;
    for (const row of rows) {
      try {
        await processOutboxRow(row);
        await markOutboxDone(row.id);
        processed += 1;
      } catch (err) {
        logger.error({ err, id: row.id }, "achievements: outbox row failed");
        await markOutboxRetryOrFail(
          row,
          err instanceof Error ? err.message : String(err),
          ACHIEVEMENTS_MAX_ATTEMPTS,
          RETRY_BACKOFF_MS,
        );
      }
    }
    return { processed };
  } finally {
    inFlight = false;
  }
}

async function processOutboxRow(row: AchievementOutboxRow): Promise<void> {
  const event = row.payload as unknown as EventLike;
  const eventTypes = [event.type, ...(event.subscriptionAliases ?? [])];
  const rules = await getEnabledRulesForEvent(row.organizationId, eventTypes);
  if (rules.length === 0) return;

  // Resolve recipients per rule, then filter to real HUMAN users in one query
  // (SERVICE principals + stale ids never earn achievements).
  const perRule = rules.map((rule) => ({
    rule,
    recipients: recipientsFor(
      {
        eventType: rule.eventType,
        subjectField: rule.subjectField,
        match: rule.match as AchievementMatch | null,
      },
      event,
    ),
  }));
  const candidates = new Set<string>();
  for (const { recipients } of perRule) recipients.forEach((u) => candidates.add(u));
  const humans = await filterHumanUserIds([...candidates]);

  for (const { rule, recipients } of perRule) {
    for (const userId of recipients) {
      if (!humans.has(userId)) continue;
      const count = await incrementProgress(rule.id, row.organizationId, userId);
      if (count < rule.threshold) continue;
      const award = await awardIfAbsent(rule.achievementId, row.organizationId, userId);
      if (!award) continue; // already held → don't re-emit / re-notify

      const a = rule.achievement;
      await emit<AchievementsAwardedEvent>({
        type: "achievements.awarded",
        occurredAt: new Date(),
        organizationId: row.organizationId,
        achievementId: a.id,
        achievementName: a.name,
        points: a.points,
        userId,
        actorId: userId,
      });
      await notify(
        "achievements.awarded",
        { userId },
        { achievementId: a.id, achievementName: a.name, points: a.points },
      );
    }
  }
}
