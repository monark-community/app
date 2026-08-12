import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { registerEventTypes } from "@monark/common";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import { truncate } from "@monark/test-utils/db";
import { achievementsRouter } from "../../src/server/router";
import { awardIfAbsent, incrementProgress } from "../../src/server/data";

// The achievements tRPC surface, driven through the real caller against a real
// Postgres: admin config (achievement + rule CRUD, event-type catalog) and the
// user gallery (catalog / summary / myAwards / myProgress, seeded with an award
// + progress rows). RBAC gates (manage vs view) and NotFound paths included.
// The award ENGINE (subscriber/worker/outbox) is covered by engine.test.ts.

const ORG = "ach-router-org";
const ADMIN = "ach-router-admin"; // ADMIN → manage + view
const MEMBER = "ach-router-member"; // member, no role → denied
const ADMIN_BUILTIN_ID = "role_admin_builtin";

const createCaller = t.createCallerFactory(achievementsRouter);
const callerFor = (userId: string | undefined) =>
  createCaller({ userId, activeOrganizationId: ORG, requestId: "ach-test" });
const admin = () => callerFor(ADMIN);

async function resetTables() {
  await truncate(getDb(), [
    "AchievementAward",
    "AchievementProgress",
    "AchievementOutbox",
    "AchievementRule",
    "Achievement",
  ]);
}

beforeAll(async () => {
  const db = getDb();
  await resetTables();
  await db.roleAssignment.deleteMany({ where: { userId: { in: [ADMIN, MEMBER] } } });
  await db.organizationMembership.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [ADMIN, MEMBER] } } });

  // Give the eventTypes catalog something to list.
  registerEventTypes("demo", { "demo.thing": { description: "A demo event", fields: [] } });

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of [ADMIN, MEMBER]) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }
  await db.role.upsert({
    where: { id: ADMIN_BUILTIN_ID },
    create: {
      id: ADMIN_BUILTIN_ID,
      key: "ADMIN",
      name: "Administrator",
      builtIn: true,
      organizationId: null,
    },
    update: {},
  });
  await assignRole({
    userId: ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
});

beforeEach(resetTables);
afterAll(resetTables);

describe("achievements admin config", () => {
  it("creates, lists (with rules), updates, and soft-deletes an achievement", async () => {
    expect(await admin().list()).toEqual([]);

    const created = await admin().create({ name: "First Post", points: 10 });
    expect(created).toMatchObject({ name: "First Post", points: 10, enabled: true, iconUrl: null });

    await admin().rules.create({
      achievementId: created.id,
      eventType: "demo.thing",
      threshold: 3,
    });
    const listed = await admin().list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.rules).toHaveLength(1);
    expect(listed[0]!.rules[0]).toMatchObject({ eventType: "demo.thing", threshold: 3 });

    const updated = await admin().update({ id: created.id, name: "Renamed", enabled: false });
    expect(updated.name).toBe("Renamed");
    expect(updated.enabled).toBe(false);

    await admin().delete({ id: created.id });
    expect(await admin().list()).toEqual([]);
  });

  it("updates and deletes rules, and 404s on unknown ids", async () => {
    const a = await admin().create({ name: "Has rules" });
    const rule = await admin().rules.create({ achievementId: a.id, eventType: "demo.thing" });
    expect(rule).toMatchObject({ threshold: 1, subjectField: "actorId" }); // defaults

    const up = await admin().rules.update({ id: rule.id, threshold: 9, match: { repo: "x" } });
    expect(up.threshold).toBe(9);
    expect(up.match).toEqual({ repo: "x" });

    await admin().rules.delete({ id: rule.id });
    await expect(admin().rules.update({ id: rule.id, threshold: 1 })).rejects.toThrow(/not found/i);

    await expect(admin().update({ id: "nope", name: "x" })).rejects.toThrow(/not found/i);
    await expect(admin().delete({ id: "nope" })).rejects.toThrow(/not found/i);
    await expect(admin().rules.delete({ id: "nope" })).rejects.toThrow(/not found/i);
  });

  it("lists the event-type catalog with payload fields", async () => {
    const catalog = await admin().eventTypes();
    const demo = catalog.find((g) => g.module === "demo");
    expect(demo?.events.some((e) => e.type === "demo.thing")).toBe(true);
  });
});

describe("achievements user gallery", () => {
  it("catalog returns only enabled achievements", async () => {
    await admin().create({ name: "Enabled", enabled: true });
    await admin().create({ name: "Disabled", enabled: false });
    const catalog = await callerFor(ADMIN).catalog();
    expect(catalog.map((a) => a.name)).toEqual(["Enabled"]);
  });

  it("summary + myAwards reflect a granted award", async () => {
    const a = await admin().create({ name: "Winner", points: 50 });
    await awardIfAbsent(a.id, ORG, ADMIN);

    const summary = await admin().summary({ latest: 3 });
    expect(summary.count).toBe(1);
    expect(summary.latest[0]).toMatchObject({ achievementId: a.id, name: "Winner", points: 50 });

    const mine = await admin().myAwards();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ achievementId: a.id, name: "Winner" });
  });

  it("myProgress surfaces the furthest-along rule per achievement", async () => {
    const a = await admin().create({ name: "In progress" });
    const slow = await admin().rules.create({
      achievementId: a.id,
      eventType: "demo.thing",
      threshold: 10,
    });
    const fast = await admin().rules.create({
      achievementId: a.id,
      eventType: "demo.other",
      threshold: 4,
    });
    await incrementProgress(slow.id, ORG, ADMIN, 2); // ratio 0.2
    await incrementProgress(fast.id, ORG, ADMIN, 3); // ratio 0.75 → the winner

    const progress = await admin().myProgress();
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ achievementId: a.id, count: 3, threshold: 4 });
  });

  it("empty gallery queries return empty shapes", async () => {
    expect(await admin().myAwards()).toEqual([]);
    expect(await admin().myProgress()).toEqual([]);
    expect((await admin().summary()).count).toBe(0);
  });
});

describe("achievements RBAC", () => {
  it("denies unauthenticated callers and members without the permission", async () => {
    await expect(callerFor(undefined).list()).rejects.toThrow();
    await expect(callerFor(MEMBER).list()).rejects.toThrow(); // manage-gated
    await expect(callerFor(MEMBER).catalog()).rejects.toThrow(); // view-gated
    await expect(callerFor(MEMBER).create({ name: "x" })).rejects.toThrow();
  });
});
