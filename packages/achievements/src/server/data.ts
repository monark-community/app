import { getDb, Prisma } from "@monark/db";
import { ensureBucket, getFileStorage, getReadyFilesByIds } from "@monark/files/server";
import type { AchievementMatch } from "../contracts/matching";
import { ACHIEVEMENT_ICON_MIME_TYPES, ACHIEVEMENT_ICONS_BUCKET } from "../contracts/types";

export type AchievementRow = Prisma.AchievementGetPayload<Record<string, never>>;
export type AchievementRuleRow = Prisma.AchievementRuleGetPayload<Record<string, never>>;
export type AchievementRuleWithAchievement = Prisma.AchievementRuleGetPayload<{
  include: { achievement: true };
}>;
export type AchievementAwardRow = Prisma.AchievementAwardGetPayload<Record<string, never>>;
export type AchievementAwardWithAchievement = Prisma.AchievementAwardGetPayload<{
  include: { achievement: true };
}>;
export type AchievementProgressRow = Prisma.AchievementProgressGetPayload<Record<string, never>>;
export type AchievementOutboxRow = Prisma.AchievementOutboxGetPayload<Record<string, never>>;

// ── Achievements CRUD ────────────────────────────────────

export async function listAchievements(
  organizationId: string,
  opts?: { includeDisabled?: boolean },
): Promise<AchievementRow[]> {
  return getDb().achievement.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(opts?.includeDisabled ? {} : { enabled: true }),
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function findAchievementById(id: string): Promise<AchievementRow | null> {
  return getDb().achievement.findFirst({ where: { id, deletedAt: null } });
}

export type CreateAchievementInput = {
  organizationId: string;
  name: string;
  description?: string | null;
  iconFileId?: string | null;
  points?: number;
  enabled?: boolean;
  createdBy: string;
};

export async function createAchievement(input: CreateAchievementInput): Promise<AchievementRow> {
  return getDb().achievement.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      iconFileId: input.iconFileId ?? null,
      points: input.points ?? 0,
      enabled: input.enabled ?? true,
      createdBy: input.createdBy,
    },
  });
}

export type UpdateAchievementPatch = {
  name?: string;
  description?: string | null;
  iconFileId?: string | null;
  points?: number;
  enabled?: boolean;
};

export async function updateAchievement(
  id: string,
  patch: UpdateAchievementPatch,
): Promise<AchievementRow> {
  return getDb().achievement.update({ where: { id }, data: patch });
}

export async function softDeleteAchievement(id: string): Promise<void> {
  await getDb().achievement.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ── Rules CRUD ───────────────────────────────────────────

export async function listRulesForAchievement(
  achievementId: string,
): Promise<AchievementRuleRow[]> {
  return getDb().achievementRule.findMany({
    where: { achievementId },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function findRuleById(id: string): Promise<AchievementRuleRow | null> {
  return getDb().achievementRule.findUnique({ where: { id } });
}

export type CreateRuleInput = {
  achievementId: string;
  organizationId: string;
  eventType: string;
  threshold?: number;
  subjectField?: string;
  match?: AchievementMatch | null;
};

export async function createRule(input: CreateRuleInput): Promise<AchievementRuleRow> {
  return getDb().achievementRule.create({
    data: {
      achievementId: input.achievementId,
      organizationId: input.organizationId,
      eventType: input.eventType,
      threshold: input.threshold ?? 1,
      subjectField: input.subjectField ?? "actorId",
      match: (input.match ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export type UpdateRulePatch = {
  eventType?: string;
  threshold?: number;
  subjectField?: string;
  match?: AchievementMatch | null;
};

export async function updateRule(id: string, patch: UpdateRulePatch): Promise<AchievementRuleRow> {
  return getDb().achievementRule.update({
    where: { id },
    data: {
      ...(patch.eventType !== undefined ? { eventType: patch.eventType } : {}),
      ...(patch.threshold !== undefined ? { threshold: patch.threshold } : {}),
      ...(patch.subjectField !== undefined ? { subjectField: patch.subjectField } : {}),
      ...(patch.match !== undefined
        ? { match: (patch.match ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull }
        : {}),
    },
  });
}

export async function deleteRule(id: string): Promise<void> {
  await getDb().achievementRule.delete({ where: { id } });
}

/** Enabled, live rules (with their achievement) whose eventType is any of
 *  `eventTypes` (the event's type + its subscription aliases). */
export async function getEnabledRulesForEvent(
  organizationId: string,
  eventTypes: string[],
): Promise<AchievementRuleWithAchievement[]> {
  return getDb().achievementRule.findMany({
    where: {
      organizationId,
      eventType: { in: eventTypes },
      achievement: { enabled: true, deletedAt: null },
    },
    include: { achievement: true },
  });
}

/** Cheap existence check for the subscriber's enqueue decision. */
export async function hasEnabledRuleForEvent(
  organizationId: string,
  eventTypes: string[],
): Promise<boolean> {
  const n = await getDb().achievementRule.count({
    where: {
      organizationId,
      eventType: { in: eventTypes },
      achievement: { enabled: true, deletedAt: null },
    },
  });
  return n > 0;
}

// ── Progress + awards ────────────────────────────────────

/** Increment a user's progress toward a rule (upsert on the unique
 *  `(ruleId, userId)`), returning the new count. */
export async function incrementProgress(
  ruleId: string,
  organizationId: string,
  userId: string,
  delta = 1,
): Promise<number> {
  const row = await getDb().achievementProgress.upsert({
    where: { ruleId_userId: { ruleId, userId } },
    create: { ruleId, organizationId, userId, count: delta },
    update: { count: { increment: delta } },
  });
  return row.count;
}

/** Grant an award if the user doesn't already hold it. Returns the award when
 *  newly created, or `null` if it already existed (idempotent via the unique
 *  `(achievementId, userId)`). */
export async function awardIfAbsent(
  achievementId: string,
  organizationId: string,
  userId: string,
): Promise<AchievementAwardRow | null> {
  try {
    return await getDb().achievementAward.create({
      data: { achievementId, organizationId, userId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}

/** The HUMAN subset of the given user ids (SERVICE principals never earn
 *  achievements). */
export async function filterHumanUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await getDb().user.findMany({
    where: { id: { in: userIds }, kind: "HUMAN", deletedAt: null },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export async function listAwardsForUser(
  organizationId: string,
  userId: string,
): Promise<AchievementAwardWithAchievement[]> {
  return getDb().achievementAward.findMany({
    where: { organizationId, userId, achievement: { deletedAt: null } },
    include: { achievement: true },
    orderBy: [{ awardedAt: "desc" }],
  });
}

/** A compact awards summary for a shell widget : the total earned count plus the
 *  most-recent `latest` awards. One count + one small page, not the full list. */
export async function summarizeAwardsForUser(
  organizationId: string,
  userId: string,
  latest: number,
): Promise<{ count: number; latest: AchievementAwardWithAchievement[] }> {
  const db = getDb();
  const where = { organizationId, userId, achievement: { deletedAt: null } } as const;
  const [count, rows] = await Promise.all([
    db.achievementAward.count({ where }),
    db.achievementAward.findMany({
      where,
      include: { achievement: true },
      orderBy: [{ awardedAt: "desc" }],
      take: latest,
    }),
  ]);
  return { count, latest: rows };
}

/** A user's in-progress (not-yet-awarded) rules with their current count +
 *  threshold, for progress bars — excludes achievements already earned. */
export async function listProgressForUser(
  organizationId: string,
  userId: string,
): Promise<Array<{ rule: AchievementRuleWithAchievement; count: number }>> {
  const rows = await getDb().achievementProgress.findMany({
    where: {
      organizationId,
      userId,
      rule: { achievement: { enabled: true, deletedAt: null } },
    },
    include: { rule: { include: { achievement: true } } },
  });
  return rows.map((r) => ({ rule: r.rule, count: r.count }));
}

// ── Durable outbox ───────────────────────────────────────

export async function enqueueOutbox(input: {
  organizationId: string;
  eventType: string;
  payload: unknown;
}): Promise<void> {
  await getDb().achievementOutbox.create({
    data: {
      organizationId: input.organizationId,
      eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue,
      // Stamp from the app clock (not the DB default) so the worker's `now`
      // comparison uses one clock — avoids app-vs-DB skew leaving a just-
      // enqueued row briefly "not due".
      nextAttemptAt: new Date(),
    },
  });
}

/**
 * Claim up to `limit` due PENDING rows via a lease : each claim moves
 * `nextAttemptAt` into the future (the lease) with a status-guarded
 * `updateMany`, so exactly one worker owns a row until it's marked DONE or the
 * lease expires (crash recovery). No RUNNING status needed.
 */
export async function claimOutboxBatch(
  limit: number,
  leaseMs: number,
  now: Date = new Date(),
): Promise<AchievementOutboxRow[]> {
  const db = getDb();
  const due = await db.achievementOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const claimed: AchievementOutboxRow[] = [];
  for (const row of due) {
    const res = await db.achievementOutbox.updateMany({
      where: { id: row.id, status: "PENDING", nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: new Date(now.getTime() + leaseMs), attempts: { increment: 1 } },
    });
    if (res.count === 1) claimed.push({ ...row, attempts: row.attempts + 1 });
  }
  return claimed;
}

export async function markOutboxDone(id: string): Promise<void> {
  await getDb().achievementOutbox.update({
    where: { id },
    data: { status: "DONE", processedAt: new Date(), error: null },
  });
}

/** Reschedule a failed row for retry, or dead-letter it to FAILED once it hits
 *  `maxAttempts`. */
export async function markOutboxRetryOrFail(
  row: AchievementOutboxRow,
  error: string,
  maxAttempts: number,
  backoffMs: number,
): Promise<void> {
  const db = getDb();
  if (row.attempts >= maxAttempts) {
    await db.achievementOutbox.update({ where: { id: row.id }, data: { status: "FAILED", error } });
  } else {
    await db.achievementOutbox.update({
      where: { id: row.id },
      data: { status: "PENDING", nextAttemptAt: new Date(Date.now() + backoffMs), error },
    });
  }
}

// ── Badge images (@monark/files) ─────────────────────────

/** Idempotently ensure the public `achievement-icons` bucket exists (badge
 *  images upload here). Best-effort at boot ; also safe to call before an
 *  upload. Public so a badge is directly + cacheably servable. */
export async function ensureAchievementIconsBucket(): Promise<void> {
  await ensureBucket({
    name: ACHIEVEMENT_ICONS_BUCKET,
    isPublic: true,
    allowedMimeTypes: ACHIEVEMENT_ICON_MIME_TYPES,
    createdBy: "system",
  });
}

/** Resolve `iconFileId`s to public badge URLs (org-scoped). Returns a
 *  `fileId → url` map ; a missing / not-ready / cross-org file is simply
 *  omitted. Never throws (a storage/config hiccup just yields no URL). */
export async function resolveIconUrls(
  organizationId: string,
  fileIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(fileIds.filter((id): id is string => !!id))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const files = await getReadyFilesByIds(organizationId, ids);
    const storage = getFileStorage();
    for (const f of files) out.set(f.id, storage.getPublicUrl(f.bucket, f.key));
  } catch {
    // Storage not configured / transient error → no URLs (UI shows the placeholder).
  }
  return out;
}
