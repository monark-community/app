import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emit } from "@monark/common";
import { _resetHandlersForTesting } from "@monark/common/events";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { _resetModelIntegrationRegistryForTesting } from "@monark/data-models/contracts";
import type {
  DataModelRecordCreatedEvent,
  DataModelRecordDeletedEvent,
  DataModelRecordUpdatedEvent,
} from "@monark/data-models/contracts";
import {
  createDataField,
  createDataModel,
  createDataRecord,
  hardDeleteDataRecord,
  softDeleteDataRecord,
  updateDataModel,
  updateDataRecord,
  upsertModelIntegration,
  type DataModelRow,
  type DataRecordRow,
} from "@monark/data-models/server";
import {
  _resetCalendarDataModelSubscriberForTesting,
  registerCalendarDataModelSubscriber,
  registerCalendarModelIntegration,
} from "@monark/calendar/server";
import { createCalendar } from "../../src/server/data";

// End-to-end test of the Calendar <-> Data Models materialization : an
// admin maps a Data Model's own fields onto Calendar's "time" / "calendarRef"
// slots, and every data-models.record-* event upserts / removes a real
// CalendarEvent, keyed on (sourceModule, sourceRecordId). This is the proof
// that the registerModelIntegration registry works with a real consumer —
// see docs/features-planning/phase-2/polymorphic-db.md.

const ORG_A = "cal-dm-org-a";
const ACTOR = "cal-dm-actor";

beforeAll(async () => {
  const db = getDb();
  await db.organization.upsert({
    where: { id: ORG_A },
    create: { id: ORG_A, slug: ORG_A, displayName: ORG_A },
    update: {},
  });
});

beforeEach(() => {
  // The event bus and both registries are in-memory singletons shared
  // across every integration file in the process ; reset them per-test so
  // handler registration + slot definitions don't leak between tests, and
  // re-register both (the subscriber's own idempotency guard would
  // otherwise no-op a second registerCalendarDataModelSubscriber() call
  // against a freshly-cleared bus).
  _resetHandlersForTesting();
  _resetModelIntegrationRegistryForTesting();
  _resetCalendarDataModelSubscriberForTesting();
  registerCalendarModelIntegration();
  registerCalendarDataModelSubscriber();
});

afterEach(async () => {
  await truncate(getDb(), [
    "CalendarEventReminder",
    "CalendarEvent",
    "DataFieldIndex",
    "DataModelIntegration",
    "DataRecord",
    "DataField",
    "DataModel",
    "Calendar",
  ]);
});

afterAll(async () => {
  await getDb().organization.deleteMany({ where: { id: ORG_A } });
});

async function emitCreated(model: DataModelRow, record: DataRecordRow): Promise<void> {
  const event: DataModelRecordCreatedEvent = {
    type: "data-models.record-created",
    dataModelId: model.id,
    dataModelKey: model.key,
    recordId: record.id,
    organizationId: model.organizationId,
    actorId: ACTOR,
    occurredAt: new Date(),
  };
  await emit(event);
}

async function emitUpdated(model: DataModelRow, record: DataRecordRow): Promise<void> {
  const event: DataModelRecordUpdatedEvent = {
    type: "data-models.record-updated",
    dataModelId: model.id,
    dataModelKey: model.key,
    recordId: record.id,
    organizationId: model.organizationId,
    actorId: ACTOR,
    changed: ["when"],
    occurredAt: new Date(),
  };
  await emit(event);
}

async function emitDeleted(model: DataModelRow, recordId: string, hard: boolean): Promise<void> {
  const event: DataModelRecordDeletedEvent = {
    type: "data-models.record-deleted",
    dataModelId: model.id,
    dataModelKey: model.key,
    recordId,
    organizationId: model.organizationId,
    actorId: ACTOR,
    hard,
    occurredAt: new Date(),
  };
  await emit(event);
}

async function findCalendarEventBySource(recordId: string) {
  return getDb().calendarEvent.findFirst({
    where: { sourceModule: "data-models", sourceRecordId: recordId },
  });
}

async function seedMappedEventsModel(calendarId: string) {
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
    required: true,
  });
  const calendarRef = await createDataField({
    dataModelId: model.id,
    key: "calendar_ref",
    label: "Calendar",
    type: "RELATION",
    config: { relationTarget: "Calendar", relationTargetKind: "SYSTEM_MODEL", cardinality: "ONE" },
    required: true,
  });
  const titleField = await createDataField({
    dataModelId: model.id,
    key: "title",
    label: "Title",
    type: "TEXT",
    config: {},
    required: true,
  });
  await updateDataModel(model.id, { titleFieldId: titleField.id });
  await upsertModelIntegration({
    dataModelId: model.id,
    module: "calendar",
    slotMappings: { time: when.id, calendarRef: calendarRef.id },
    enabled: true,
  });
  return { model, whenKey: when.key, calendarRefKey: calendarRef.key };
}

describe("Calendar materialization from Data Records", () => {
  it("creates a CalendarEvent when a mapped record is created", async () => {
    const calendar = await createCalendar({ organizationId: ORG_A, name: "Team Calendar" });
    const { model, whenKey, calendarRefKey } = await seedMappedEventsModel(calendar.id);
    const at = new Date("2026-08-01T15:00:00.000Z");

    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "Launch", [whenKey]: at, [calendarRefKey]: calendar.id },
      createdBy: ACTOR,
    });
    await emitCreated(model, record);

    const materialized = await findCalendarEventBySource(record.id);
    expect(materialized).not.toBeNull();
    expect(materialized?.calendarId).toBe(calendar.id);
    expect(materialized?.title).toBe("Launch");
    expect(materialized?.eventType).toBe("PUNCTUAL");
    expect(materialized?.startAt.toISOString()).toBe(at.toISOString());
    expect(materialized?.endAt.toISOString()).toBe(at.toISOString());
  });

  it("upserts (not duplicates) on record-updated, moving the event's time", async () => {
    const calendar = await createCalendar({ organizationId: ORG_A, name: "Team Calendar" });
    const { model, whenKey, calendarRefKey } = await seedMappedEventsModel(calendar.id);
    const record = await createDataRecord({
      dataModelId: model.id,
      data: {
        title: "Launch",
        [whenKey]: new Date("2026-08-01T15:00:00.000Z"),
        [calendarRefKey]: calendar.id,
      },
      createdBy: ACTOR,
    });
    await emitCreated(model, record);

    const newAt = new Date("2026-08-02T09:30:00.000Z");
    const updated = await updateDataRecord(record.id, { data: { [whenKey]: newAt } });
    await emitUpdated(model, updated);

    const rows = await getDb().calendarEvent.findMany({
      where: { sourceModule: "data-models", sourceRecordId: record.id },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.startAt.toISOString()).toBe(newAt.toISOString());
  });

  it("soft-deletes the CalendarEvent on a soft record-deleted, hard-deletes on hard", async () => {
    const calendar = await createCalendar({ organizationId: ORG_A, name: "Team Calendar" });
    const { model, whenKey, calendarRefKey } = await seedMappedEventsModel(calendar.id);
    const record = await createDataRecord({
      dataModelId: model.id,
      data: {
        title: "Launch",
        [whenKey]: new Date("2026-08-01T15:00:00.000Z"),
        [calendarRefKey]: calendar.id,
      },
      createdBy: ACTOR,
    });
    await emitCreated(model, record);

    await softDeleteDataRecord(record.id);
    await emitDeleted(model, record.id, false);
    const softDeleted = await findCalendarEventBySource(record.id);
    expect(softDeleted?.deletedAt).not.toBeNull();

    await hardDeleteDataRecord(record.id);
    await emitDeleted(model, record.id, true);
    const hardDeleted = await findCalendarEventBySource(record.id);
    expect(hardDeleted).toBeNull();
  });

  it("does not materialize when the model has no enabled calendar integration", async () => {
    const model = await createDataModel({
      organizationId: ORG_A,
      key: "unmapped",
      name: "Unmapped",
      createdBy: ACTOR,
    });
    await createDataField({
      dataModelId: model.id,
      key: "title",
      label: "Title",
      type: "TEXT",
      config: {},
      required: true,
    });
    const record = await createDataRecord({
      dataModelId: model.id,
      data: { title: "No integration here" },
      createdBy: ACTOR,
    });
    await emitCreated(model, record);

    expect(await findCalendarEventBySource(record.id)).toBeNull();
  });

  it("removes a previously-materialized event once the integration is disabled", async () => {
    const calendar = await createCalendar({ organizationId: ORG_A, name: "Team Calendar" });
    const { model, whenKey, calendarRefKey } = await seedMappedEventsModel(calendar.id);
    const record = await createDataRecord({
      dataModelId: model.id,
      data: {
        title: "Launch",
        [whenKey]: new Date("2026-08-01T15:00:00.000Z"),
        [calendarRefKey]: calendar.id,
      },
      createdBy: ACTOR,
    });
    await emitCreated(model, record);
    expect(await findCalendarEventBySource(record.id)).not.toBeNull();

    // Disabling the integration (mapping untouched) means the record no
    // longer satisfies an *enabled* mapping — a subsequent sync should
    // retire the materialized event.
    const whenField = await getDb().dataField.findFirstOrThrow({
      where: { dataModelId: model.id, key: whenKey },
    });
    const calendarRefField = await getDb().dataField.findFirstOrThrow({
      where: { dataModelId: model.id, key: calendarRefKey },
    });
    await upsertModelIntegration({
      dataModelId: model.id,
      module: "calendar",
      slotMappings: { time: whenField.id, calendarRef: calendarRefField.id },
      enabled: false,
    });

    const updated = await updateDataRecord(record.id, {});
    await emitUpdated(model, updated);

    const afterDisable = await findCalendarEventBySource(record.id);
    expect(afterDisable?.deletedAt).not.toBeNull();
  });
});
