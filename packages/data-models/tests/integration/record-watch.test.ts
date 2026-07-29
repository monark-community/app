import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { emit } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import { createRole } from "@monark/rbac/server";
import { createDataModel, createDataRecord, setDataRecordRoleAccess } from "../../src/server/data";
import { setModelWatch, setRecordWatch } from "../../src/server/watchers";
import { registerDataModelsNotificationKinds } from "../../src/server/notification-kinds";
import { registerDataModelRecordWatchSubscriber } from "../../src/server/record-watch-subscriber";

// The watcher notification subscriber : a record change fans out to the
// record's watchers + the model's watchers, minus the actor, minus anyone the
// record's row-level access hides it from. `emit()` awaits its handlers, so
// after an emit the resulting Notification rows exist. Notifications are keyed
// by kind `data-models.record-changed`.

const ORG = "dm-watch-org";
const U_WATCHER = "dm-watch-watcher";
const U_ACTOR = "dm-watch-actor";
const U_MODEL = "dm-watch-modelwatcher";
const U_NOACCESS = "dm-watch-noaccess";

let modelId = "";
let openRecordId = "";
let restrictedRecordId = "";

async function countNotifs(userId: string): Promise<number> {
  return getDb().notification.count({ where: { userId, kind: "data-models.record-changed" } });
}

function updatedEvent(recordId: string, actorId: string) {
  return {
    type: "data-models.record-updated" as const,
    dataModelId: modelId,
    dataModelKey: "notes",
    recordId,
    organizationId: ORG,
    actorId,
    changed: ["title"],
    occurredAt: new Date(),
  };
}

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({
    where: { id: { in: [U_WATCHER, U_ACTOR, U_MODEL, U_NOACCESS] } },
  });

  _resetHandlersForTesting();
  registerDataModelsNotificationKinds();
  registerDataModelRecordWatchSubscriber();

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of [U_WATCHER, U_ACTOR, U_MODEL, U_NOACCESS]) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
  }

  const model = await createDataModel({
    organizationId: ORG,
    key: "notes",
    name: "Notes",
    createdBy: U_ACTOR,
  });
  modelId = model.id;
  const open = await createDataRecord({
    dataModelId: modelId,
    data: { title: "open note" },
    createdBy: U_ACTOR,
  });
  openRecordId = open.id;

  // A record restricted to a role nobody in the test holds.
  const restricted = await createDataRecord({
    dataModelId: modelId,
    data: { title: "restricted note" },
    createdBy: U_ACTOR,
  });
  restrictedRecordId = restricted.id;
  const gatingRole = await createRole({
    organizationId: ORG,
    key: "watch-gating",
    name: "Watch Gating",
    permissions: [],
    createdById: U_ACTOR,
  });
  await setDataRecordRoleAccess(restrictedRecordId, [gatingRole.id]);
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({
    where: { id: { in: [U_WATCHER, U_ACTOR, U_MODEL, U_NOACCESS] } },
  });
});

describe("data-models record watchers — notification fan-out", () => {
  it("notifies a record watcher when the record changes", async () => {
    await setRecordWatch(openRecordId, U_WATCHER, true);
    const before = await countNotifs(U_WATCHER);
    await emit(updatedEvent(openRecordId, U_ACTOR));
    expect(await countNotifs(U_WATCHER)).toBe(before + 1);
  });

  it("does NOT notify the actor about their own change", async () => {
    await setRecordWatch(openRecordId, U_ACTOR, true);
    const before = await countNotifs(U_ACTOR);
    await emit(updatedEvent(openRecordId, U_ACTOR));
    expect(await countNotifs(U_ACTOR)).toBe(before);
  });

  it("notifies a model watcher when any record in the model is created", async () => {
    await setModelWatch(modelId, U_MODEL, true);
    const before = await countNotifs(U_MODEL);
    await emit({
      type: "data-models.record-created" as const,
      dataModelId: modelId,
      dataModelKey: "notes",
      recordId: openRecordId,
      organizationId: ORG,
      actorId: U_ACTOR,
      occurredAt: new Date(),
    });
    expect(await countNotifs(U_MODEL)).toBe(before + 1);
  });

  it("does NOT notify a watcher who can't see the record (row-level access)", async () => {
    await setRecordWatch(restrictedRecordId, U_NOACCESS, true);
    const before = await countNotifs(U_NOACCESS);
    await emit(updatedEvent(restrictedRecordId, U_ACTOR));
    expect(await countNotifs(U_NOACCESS)).toBe(before);
  });
});
