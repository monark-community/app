import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import {
  _resetModelIntegrationRegistryForTesting,
  registerModelIntegration,
} from "../../src/contracts/integrations";
import {
  createDataField,
  createDataModel,
  findModelIntegration,
  listModelIntegrationsForModel,
  upsertModelIntegration,
} from "../../src/server/data";

// Integration tests for the registerModelIntegration registry + the
// DataModelIntegration upsert's slot-mapping validation — the "mapping, not
// reserved field keys" mechanism described in docs/features-planning/
// phase-2/polymorphic-db.md.

const ORG_A = "dm-int-org-a";
const ACTOR = "dm-int-actor";

beforeAll(async () => {
  const db = getDb();
  await db.organization.upsert({
    where: { id: ORG_A },
    create: { id: ORG_A, slug: ORG_A, displayName: ORG_A },
    update: {},
  });
});

beforeEach(() => {
  _resetModelIntegrationRegistryForTesting();
  registerModelIntegration("calendar", {
    description: "test calendar integration",
    slots: {
      time: { types: ["DATE", "DATETIME"], required: true, description: "start time" },
      calendarRef: {
        types: ["RELATION"],
        relationTarget: "Calendar",
        required: true,
        description: "target calendar",
      },
    },
  });
});

afterEach(async () => {
  await truncate(getDb(), [
    "DataFieldIndex",
    "DataModelIntegration",
    "DataRecord",
    "DataField",
    "DataModel",
  ]);
});

afterAll(async () => {
  await getDb().organization.deleteMany({ where: { id: ORG_A } });
});

async function seedEventsModel() {
  const model = await createDataModel({
    organizationId: ORG_A,
    key: "events",
    name: "Events",
    createdBy: ACTOR,
  });
  const when = await createDataField({
    dataModelId: model.id,
    key: "when",
    label: "When",
    type: "DATETIME",
    config: {},
  });
  const calendarRef = await createDataField({
    dataModelId: model.id,
    key: "calendar_ref",
    label: "Calendar",
    type: "RELATION",
    config: { relationTarget: "Calendar", relationTargetKind: "SYSTEM_MODEL", cardinality: "ONE" },
  });
  const notes = await createDataField({
    dataModelId: model.id,
    key: "notes",
    label: "Notes",
    type: "TEXT",
    config: {},
  });
  return { model, when, calendarRef, notes };
}

describe("upsertModelIntegration — validation", () => {
  it("rejects an unregistered module", async () => {
    const { model } = await seedEventsModel();
    await expect(
      upsertModelIntegration({
        dataModelId: model.id,
        module: "not-a-real-module",
        slotMappings: {},
        enabled: false,
      }),
    ).rejects.toThrow(/Unknown integration module/);
  });

  it("rejects a field of the wrong type for a slot", async () => {
    const { model, notes, calendarRef } = await seedEventsModel();
    await expect(
      upsertModelIntegration({
        dataModelId: model.id,
        module: "calendar",
        // `notes` is TEXT, not DATE/DATETIME.
        slotMappings: { time: notes.id, calendarRef: calendarRef.id },
        enabled: false,
      }),
    ).rejects.toThrow(/isn't allowed for this slot/);
  });

  it("rejects a RELATION field whose relationTarget doesn't match the slot", async () => {
    const { model, when } = await seedEventsModel();
    const wrongTarget = await createDataField({
      dataModelId: model.id,
      key: "wrong_target",
      label: "Wrong Target",
      type: "RELATION",
      config: {
        relationTarget: "SomeOtherModel",
        relationTargetKind: "SYSTEM_MODEL",
        cardinality: "ONE",
      },
    });
    await expect(
      upsertModelIntegration({
        dataModelId: model.id,
        module: "calendar",
        slotMappings: { time: when.id, calendarRef: wrongTarget.id },
        enabled: false,
      }),
    ).rejects.toThrow(/must be a RELATION field targeting "Calendar"/);
  });

  it("rejects enabling with a required slot left unmapped", async () => {
    const { model, when } = await seedEventsModel();
    await expect(
      upsertModelIntegration({
        dataModelId: model.id,
        module: "calendar",
        slotMappings: { time: when.id },
        enabled: true,
      }),
    ).rejects.toThrow(/requires slot "calendarRef"/);
  });

  it("allows saving a partial, disabled mapping (in-progress configuration)", async () => {
    const { model, when } = await seedEventsModel();
    const saved = await upsertModelIntegration({
      dataModelId: model.id,
      module: "calendar",
      slotMappings: { time: when.id },
      enabled: false,
    });
    expect(saved.enabled).toBe(false);
  });

  it("saves a fully-mapped, enabled integration and round-trips via get", async () => {
    const { model, when, calendarRef } = await seedEventsModel();
    await upsertModelIntegration({
      dataModelId: model.id,
      module: "calendar",
      slotMappings: { time: when.id, calendarRef: calendarRef.id },
      enabled: true,
    });
    const fetched = await findModelIntegration(model.id, "calendar");
    expect(fetched?.enabled).toBe(true);
    expect(fetched?.slotMappings).toEqual({ time: when.id, calendarRef: calendarRef.id });

    const list = await listModelIntegrationsForModel(model.id);
    expect(list.map((i) => i.module)).toEqual(["calendar"]);
  });

  it("upserts on a second save rather than duplicating", async () => {
    const { model, when, calendarRef } = await seedEventsModel();
    await upsertModelIntegration({
      dataModelId: model.id,
      module: "calendar",
      slotMappings: { time: when.id },
      enabled: false,
    });
    await upsertModelIntegration({
      dataModelId: model.id,
      module: "calendar",
      slotMappings: { time: when.id, calendarRef: calendarRef.id },
      enabled: true,
    });
    const list = await listModelIntegrationsForModel(model.id);
    expect(list.length).toBe(1);
    expect(list[0]?.enabled).toBe(true);
  });
});
