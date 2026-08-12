import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { emit, on, WILDCARD_EVENT_TYPE } from "@monark/common";
import type { DomainEvent } from "@monark/common/contracts/events";
import { truncate } from "@monark/test-utils/db";
import {
  achievementsTick,
  createAchievement,
  createRule,
  registerAchievementsSubscriber,
  _resetAchievementsSubscriberForTesting,
} from "../../src/server";
import { registerAchievementsNotificationKinds } from "../../src/server/notification-kinds";

// End-to-end : emit a domain event → the wildcard subscriber persists it to the
// outbox → `achievementsTick` (the worker's unit of work) credits the actor and
// awards once the threshold is crossed, emitting `achievements.awarded` + an
// in-app notification. Exercises threshold counting, award idempotency, payload
// matching, and the SERVICE-user skip, against a real Postgres testcontainer.

const ORG = "ach-eng-org";
const ACTOR = "ach-eng-actor"; // HUMAN
const SVC = "svc_ach_eng"; // SERVICE principal — never earns achievements
const captured: DomainEvent[] = [];

function fire(over: Record<string, unknown>): Promise<void> {
  return emit({
    type: "kanban.card-created",
    occurredAt: new Date(),
    organizationId: ORG,
    cardId: "c1",
    actorId: ACTOR,
    ...over,
  } as unknown as DomainEvent);
}

const awardedEvents = () => captured.filter((e) => e.type === "achievements.awarded");

beforeAll(async () => {
  const db = getDb();
  registerAchievementsNotificationKinds();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [ACTOR, SVC] } } });
  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  await db.user.create({ data: { id: ACTOR, email: `${ACTOR}@test.local`, kind: "HUMAN" } });
  await db.user.create({ data: { id: SVC, email: `${SVC}@test.local`, kind: "SERVICE" } });

  _resetAchievementsSubscriberForTesting();
  registerAchievementsSubscriber();
  on(WILDCARD_EVENT_TYPE, (e) => {
    captured.push(e);
  });
});

beforeEach(() => {
  captured.length = 0;
});

afterEach(async () => {
  const db = getDb();
  await truncate(db, [
    "AchievementOutbox",
    "AchievementAward",
    "AchievementProgress",
    "AchievementRule",
    "Achievement",
  ]);
  await db.notification.deleteMany({ where: { userId: { in: [ACTOR, SVC] } } });
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [ACTOR, SVC] } } });
});

async function seed(
  threshold: number,
  over?: { eventType?: string; match?: Record<string, string>; subjectField?: string },
) {
  const a = await createAchievement({
    organizationId: ORG,
    name: "Card Creator",
    points: 10,
    createdBy: ACTOR,
  });
  const rule = await createRule({
    achievementId: a.id,
    organizationId: ORG,
    eventType: over?.eventType ?? "kanban.card-created",
    threshold,
    subjectField: over?.subjectField,
    match: over?.match ?? null,
  });
  return { achievement: a, rule };
}

describe("award engine", () => {
  it("counts to the threshold, awards once, emits + notifies", async () => {
    const { achievement, rule } = await seed(2);
    const db = getDb();

    await fire({ cardId: "c1" });
    await achievementsTick();
    expect(
      (await db.achievementProgress.findFirst({ where: { ruleId: rule.id, userId: ACTOR } }))
        ?.count,
    ).toBe(1);
    expect(await db.achievementAward.count({ where: { achievementId: achievement.id } })).toBe(0);

    await fire({ cardId: "c2" });
    await achievementsTick();
    expect(
      (await db.achievementProgress.findFirst({ where: { ruleId: rule.id, userId: ACTOR } }))
        ?.count,
    ).toBe(2);
    expect(
      await db.achievementAward.count({ where: { achievementId: achievement.id, userId: ACTOR } }),
    ).toBe(1);
    expect(awardedEvents().map((e) => (e as { userId: string }).userId)).toContain(ACTOR);
    expect(
      await db.notification.count({ where: { userId: ACTOR, kind: "achievements.awarded" } }),
    ).toBeGreaterThanOrEqual(1);

    // A further event must not double-award or re-emit.
    captured.length = 0;
    await fire({ cardId: "c3" });
    await achievementsTick();
    expect(
      await db.achievementAward.count({ where: { achievementId: achievement.id, userId: ACTOR } }),
    ).toBe(1);
    expect(awardedEvents()).toHaveLength(0);
  });

  it("gates on a payload match", async () => {
    const { achievement } = await seed(1, {
      eventType: "kanban.card-moved",
      match: { toColumnId: "done" },
    });
    const db = getDb();

    await emit({
      type: "kanban.card-moved",
      occurredAt: new Date(),
      organizationId: ORG,
      cardId: "c1",
      actorId: ACTOR,
      toColumnId: "todo",
    } as unknown as DomainEvent);
    await achievementsTick();
    expect(await db.achievementAward.count({ where: { achievementId: achievement.id } })).toBe(0);

    await emit({
      type: "kanban.card-moved",
      occurredAt: new Date(),
      organizationId: ORG,
      cardId: "c1",
      actorId: ACTOR,
      toColumnId: "done",
    } as unknown as DomainEvent);
    await achievementsTick();
    expect(
      await db.achievementAward.count({ where: { achievementId: achievement.id, userId: ACTOR } }),
    ).toBe(1);
  });

  it("never credits a SERVICE principal", async () => {
    const { rule } = await seed(1);
    const db = getDb();
    await fire({ actorId: SVC });
    await achievementsTick();
    expect(await db.achievementProgress.count({ where: { ruleId: rule.id, userId: SVC } })).toBe(0);
    expect(await db.achievementAward.count()).toBe(0);
  });

  it("only enqueues events an enabled rule watches", async () => {
    const db = getDb();
    // No rules → the subscriber must not persist anything.
    await fire({ cardId: "c1" });
    expect(await db.achievementOutbox.count()).toBe(0);

    // With a rule, the same event is enqueued.
    await seed(5);
    await fire({ cardId: "c2" });
    expect(await db.achievementOutbox.count()).toBeGreaterThanOrEqual(1);
  });
});
