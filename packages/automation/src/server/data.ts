import { getDb, Prisma, trigramMatch, trigramOrder } from "@monark/db";
import {
  cursorFindArgs,
  resolveLimit,
  toPage,
  type Paginated,
  type PaginationArgs,
} from "@monark/common/pagination";
import { type AutomationGraph, parseGraph } from "../contracts/graph";
import { type AutomationRunStepLog } from "../contracts/run";
import { nextFireTime, scheduleFromGraph } from "../contracts/schedule";

/**
 * A new automation starts with a single Event Trigger node so the editor opens
 * ready to build — the trigger's event is chosen in the editor, not at create.
 */
const SEEDED_TRIGGER_GRAPH: AutomationGraph = {
  nodes: [
    { id: "trigger", type: "automation.event-trigger", position: { x: 80, y: 96 }, config: {} },
  ],
  edges: [],
};

export type AutomationRow = Prisma.AutomationGetPayload<Record<string, never>>;
export type AutomationRunRow = Prisma.AutomationRunGetPayload<Record<string, never>>;
export type AutomationRunStepRow = Prisma.AutomationRunStepGetPayload<Record<string, never>>;
export type AutomationRunWithSteps = Prisma.AutomationRunGetPayload<{ include: { steps: true } }>;

/**
 * The `graph` column is Prisma `Json` (an opaque `JsonValue`). Returning it raw
 * over tRPC both leaks an untyped blob and risks TS2589 "excessively deep"
 * errors, so the data layer parses it into a typed {@link AutomationGraph} and
 * routers serialize rows through {@link serializeAutomation} before returning.
 */
export type SerializedAutomation = Omit<AutomationRow, "graph"> & { graph: AutomationGraph };

export function serializeAutomation(row: AutomationRow): SerializedAutomation {
  return { ...row, graph: parseGraph(row.graph) };
}

// A graph is plain JSON, but the zod-inferred type isn't assignable to
// Prisma's InputJsonValue directly ; this narrows it for the write.
function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// ── Automations ───────────────────────────────────────────

export type ListAutomationsInput = PaginationArgs & {
  organizationId: string;
  includeDeleted?: boolean;
  search?: string;
};

export async function listAutomations(
  input: ListAutomationsInput,
): Promise<Paginated<AutomationRow>> {
  const db = getDb();
  const where: Prisma.AutomationWhereInput = {
    organizationId: input.organizationId,
    ...(input.includeDeleted ? {} : { deletedAt: null }),
    ...(input.search && input.search.trim().length > 0
      ? { name: { contains: input.search, mode: "insensitive" } }
      : {}),
  };
  const limit = resolveLimit(input.limit);
  const [rows, total] = await Promise.all([
    db.automation.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...cursorFindArgs(limit, input.cursor),
    }),
    db.automation.count({ where }),
  ]);
  return toPage(rows, total, limit);
}

export async function findAutomationById(id: string): Promise<AutomationRow | null> {
  return getDb().automation.findUnique({ where: { id } });
}

/**
 * Fuzzy automation search by name (trigram `pg_trgm`, typo-tolerant) for the
 * global palette — a light `{ id, name }` ranked by similarity. Separate from
 * `listAutomations` (whose `search` stays an exact substring filter for the
 * automations list page). Raw SQL (no similarity in Prisma).
 */
export async function searchAutomations(input: {
  organizationId: string;
  query: string;
  limit: number;
}): Promise<Array<{ id: string; name: string }>> {
  return getDb().$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT id, name
    FROM "Automation"
    WHERE "organizationId" = ${input.organizationId}
      AND "deletedAt" IS NULL
      AND ${trigramMatch(["name"], input.query)}
    ORDER BY ${trigramOrder(["name"], input.query)}, "updatedAt" DESC
    LIMIT ${input.limit}
  `);
}

export type CreateAutomationInput = {
  organizationId: string;
  name: string;
  description?: string | null;
  /** Optional at create ; the editor sets it from the trigger node on save. */
  triggerEventType?: string;
  graph?: AutomationGraph;
  enabled?: boolean;
  createdBy: string;
};

/**
 * Recompute `scheduleNextRunAt` from the automation's current state and persist
 * it when it changed. For a live scheduled automation it's the next fire after
 * now ; otherwise null. Idempotent for an unchanged future schedule (recomputing
 * yields the same next fire), so it's safe to call after every save / enable.
 */
async function syncScheduleNextRunAt(row: AutomationRow): Promise<AutomationRow> {
  const schedule = row.deletedAt || !row.enabled ? null : scheduleFromGraph(parseGraph(row.graph));
  const next = schedule ? nextFireTime(schedule, new Date()) : null;
  if ((next?.getTime() ?? null) === (row.scheduleNextRunAt?.getTime() ?? null)) return row;
  return getDb().automation.update({ where: { id: row.id }, data: { scheduleNextRunAt: next } });
}

export async function createAutomation(input: CreateAutomationInput): Promise<AutomationRow> {
  const row = await getDb().automation.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      triggerEventType: input.triggerEventType ?? "",
      graph: toJson(input.graph ?? SEEDED_TRIGGER_GRAPH),
      enabled: input.enabled ?? false,
      createdBy: input.createdBy,
    },
  });
  return syncScheduleNextRunAt(row);
}

export type UpdateAutomationPatch = {
  name?: string;
  description?: string | null;
  triggerEventType?: string;
  graph?: AutomationGraph;
  enabled?: boolean;
};

export async function updateAutomation(
  id: string,
  patch: UpdateAutomationPatch,
): Promise<AutomationRow> {
  const row = await getDb().automation.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.triggerEventType !== undefined ? { triggerEventType: patch.triggerEventType } : {}),
      ...(patch.graph !== undefined ? { graph: toJson(patch.graph) } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    },
  });
  return syncScheduleNextRunAt(row);
}

export async function softDeleteAutomation(id: string): Promise<void> {
  await getDb().automation.update({
    where: { id },
    data: { deletedAt: new Date(), enabled: false, scheduleNextRunAt: null },
  });
}

export async function restoreAutomation(id: string): Promise<void> {
  const row = await getDb().automation.update({ where: { id }, data: { deletedAt: null } });
  await syncScheduleNextRunAt(row);
}

// ── Scheduler (cron-like triggers) ────────────────────────

/** Live scheduled automations whose next fire is due — the scheduler's poll. */
export async function listDueScheduledAutomations(
  now: Date,
  limit: number,
): Promise<AutomationRow[]> {
  return getDb().automation.findMany({
    where: { enabled: true, deletedAt: null, scheduleNextRunAt: { not: null, lte: now } },
    orderBy: [{ scheduleNextRunAt: "asc" }, { id: "asc" }],
    take: limit,
  });
}

/**
 * Atomically claim a schedule fire : advance `scheduleNextRunAt` from `expected`
 * to `next`, but only if it still equals `expected`. Exactly one worker wins
 * (safe across processes) ; the rest see `count === 0` and skip — so a fire
 * enqueues exactly one run.
 */
export async function claimScheduledFire(
  id: string,
  expected: Date,
  next: Date | null,
): Promise<boolean> {
  const res = await getDb().automation.updateMany({
    where: { id, scheduleNextRunAt: expected },
    data: { scheduleNextRunAt: next },
  });
  return res.count === 1;
}

export async function hardDeleteAutomation(id: string): Promise<void> {
  await getDb().automation.delete({ where: { id } });
}

// ── Runs (read surface for the UI) ────────────────────────

export type ListAutomationRunsInput = PaginationArgs & {
  organizationId: string;
  automationId?: string;
};

export async function listAutomationRuns(
  input: ListAutomationRunsInput,
): Promise<Paginated<AutomationRunRow>> {
  const db = getDb();
  const where: Prisma.AutomationRunWhereInput = {
    organizationId: input.organizationId,
    ...(input.automationId ? { automationId: input.automationId } : {}),
  };
  const limit = resolveLimit(input.limit);
  const [rows, total] = await Promise.all([
    db.automationRun.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...cursorFindArgs(limit, input.cursor),
    }),
    db.automationRun.count({ where }),
  ]);
  return toPage(rows, total, limit);
}

export async function findAutomationRunById(id: string): Promise<AutomationRunWithSteps | null> {
  return getDb().automationRun.findUnique({
    where: { id },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
}

// ── Org members (for the editor's user picker) ────────────

export type OrgMember = {
  id: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
};

/** Active members of an org (for a user-picker config field). */
export async function listOrgMembers(organizationId: string): Promise<OrgMember[]> {
  const memberships = await getDb().organizationMembership.findMany({
    // Exclude machine principals (service accounts) from the member picker.
    where: { organizationId, leftAt: null, user: { is: { kind: "HUMAN" } } },
    select: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
    orderBy: { user: { displayName: "asc" } },
  });
  return memberships.map((m) => m.user);
}

// ── Trigger matching + run execution (engine / worker) ────

/**
 * Enabled, live automations in an org whose trigger matches an event type.
 * The subscriber calls this per resolved org on every bus event, so it leans
 * on the `@@index([organizationId, triggerEventType])` composite index.
 */
export async function findEnabledAutomationsForEvent(
  organizationId: string,
  eventType: string,
): Promise<AutomationRow[]> {
  return getDb().automation.findMany({
    where: { organizationId, triggerEventType: eventType, enabled: true, deletedAt: null },
  });
}

export type CreatePendingRunInput = {
  automationId: string;
  organizationId: string;
  triggerEventType: string;
  triggerPayload: unknown;
  manual?: boolean;
  createdBy?: string | null;
};

export async function createPendingRun(input: CreatePendingRunInput): Promise<AutomationRunRow> {
  return getDb().automationRun.create({
    data: {
      automationId: input.automationId,
      organizationId: input.organizationId,
      triggerEventType: input.triggerEventType,
      triggerPayload: toJson(input.triggerPayload),
      manual: input.manual ?? false,
      createdBy: input.createdBy ?? null,
      // Stamp the due time from the app clock (not the DB `@default(now())`) so
      // it shares the worker poller's clock domain — otherwise DB/app clock
      // skew (notably a drifting Docker Desktop VM clock) can make a just-
      // enqueued run look "not yet due" and delay its first pickup.
      nextAttemptAt: new Date(),
    },
  });
}

/** Pending runs due for execution, oldest first — the worker's poll query. */
export async function listPendingDueRuns(limit: number): Promise<AutomationRunRow[]> {
  return getDb().automationRun.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });
}

/**
 * Atomically claim a pending run for execution: PENDING → RUNNING, stamp
 * `startedAt`. The `where status: "PENDING"` guard makes the claim safe across
 * concurrent workers — exactly one `updateMany` wins, the rest see `count === 0`
 * and skip. `attempts` is NOT bumped here — it counts *failures* (incremented on
 * retry) so a delay resume doesn't burn the retry budget. Returns the claimed
 * row, or null if lost.
 */
export async function claimRun(id: string): Promise<AutomationRunRow | null> {
  const db = getDb();
  const claimed = await db.automationRun.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count === 0) return null;
  return db.automationRun.findUnique({ where: { id } });
}

export async function markRunSucceeded(id: string, output: unknown): Promise<void> {
  await getDb().automationRun.update({
    where: { id },
    data: {
      status: "SUCCEEDED",
      finishedAt: new Date(),
      output: toJson(output ?? {}),
      error: null,
    },
  });
}

/** Schedule a retry: back to PENDING with a future `nextAttemptAt` + the new attempt count. */
export async function markRunForRetry(
  id: string,
  error: string,
  nextAttemptAt: Date,
  attempts: number,
): Promise<void> {
  await getDb().automationRun.update({
    where: { id },
    data: { status: "PENDING", error, nextAttemptAt, attempts },
  });
}

/**
 * Suspend a run for a durable delay: back to PENDING with `nextAttemptAt` set to
 * the resume time. Does not touch `attempts` (a resume isn't a retry) or `error`.
 */
export async function markRunForResume(id: string, resumeAt: Date): Promise<void> {
  await getDb().automationRun.update({
    where: { id },
    data: { status: "PENDING", nextAttemptAt: resumeAt },
  });
}

/** All steps recorded for a run so far (for resuming a suspended run). */
export async function listRunSteps(runId: string): Promise<AutomationRunStepRow[]> {
  return getDb().automationRunStep.findMany({
    where: { runId },
    orderBy: { sequence: "asc" },
  });
}

export async function markRunFailed(id: string, error: string): Promise<void> {
  await getDb().automationRun.update({
    where: { id },
    data: { status: "FAILED", finishedAt: new Date(), error },
  });
}

export async function addRunStep(input: {
  runId: string;
  nodeId: string;
  nodeType: string;
  sequence: number;
  input?: unknown;
}): Promise<AutomationRunStepRow> {
  return getDb().automationRunStep.create({
    data: {
      runId: input.runId,
      nodeId: input.nodeId,
      nodeType: input.nodeType,
      sequence: input.sequence,
      ...(input.input !== undefined ? { input: toJson(input.input) } : {}),
    },
  });
}

export async function finishRunStep(
  id: string,
  result: {
    status: "SUCCEEDED" | "FAILED" | "SKIPPED";
    output?: unknown;
    error?: string;
    /** Output handles the node activated ; persisted for resume after a delay. */
    activeHandles?: string[];
    /** Structured log lines the node emitted ; only written when non-empty. */
    logs?: AutomationRunStepLog[];
  },
): Promise<void> {
  await getDb().automationRunStep.update({
    where: { id },
    data: {
      status: result.status,
      finishedAt: new Date(),
      ...(result.output !== undefined ? { output: toJson(result.output) } : {}),
      ...(result.error !== undefined ? { error: result.error } : {}),
      ...(result.activeHandles !== undefined ? { activeHandles: result.activeHandles } : {}),
      ...(result.logs !== undefined && result.logs.length > 0 ? { logs: toJson(result.logs) } : {}),
    },
  });
}
