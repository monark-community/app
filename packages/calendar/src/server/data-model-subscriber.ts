import { logger, on } from "@monark/common";
import type {
  DataModelRecordCreatedEvent,
  DataModelRecordDeletedEvent,
  DataModelRecordUpdatedEvent,
} from "@monark/data-models/contracts";
import {
  findDataRecordById,
  findModelIntegration,
  listDataFields,
} from "@monark/data-models/server";
import {
  hardDeleteCalendarEventBySource,
  softDeleteCalendarEventBySource,
  upsertCalendarEventFromSource,
} from "./data";

const SOURCE_MODULE = "data-models";

/** Reads a mapped field's stored value out of a record's `data`, resolving
 * a RELATION field down to a single id even if it's stored as a one-item
 * array (defensive — the "calendar" slot expects a single target). */
function resolveSingleId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) return value[0];
  return null;
}

function resolveDate(value: unknown): Date | null {
  const at = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

type Materialization = { title: string; at: Date; calendarId: string };

/** Resolves what a record's calendar integration mapping currently points
 * at, or null if the model has no enabled "calendar" integration, or the
 * mapped fields don't currently resolve to a usable value (e.g. the time
 * field is empty). Fields are looked up including archived ones — an
 * integration mapping that references an archived field should keep
 * resolving against its last-known value rather than silently breaking. */
async function resolveMaterialization(
  dataModelId: string,
  recordId: string,
): Promise<Materialization | null> {
  const integration = await findModelIntegration(dataModelId, "calendar");
  if (!integration || !integration.enabled) return null;

  const record = await findDataRecordById(recordId);
  if (!record) return null;

  const fields = await listDataFields(dataModelId, { includeArchived: true });
  const fieldsById = new Map(fields.map((f) => [f.id, f]));
  const mapping = integration.slotMappings as Record<string, string>;
  const timeField = mapping.time ? fieldsById.get(mapping.time) : undefined;
  const calendarField = mapping.calendarRef ? fieldsById.get(mapping.calendarRef) : undefined;
  if (!timeField || !calendarField) return null;

  const data = record.data as Record<string, unknown>;
  const at = resolveDate(data[timeField.key]);
  const calendarId = resolveSingleId(data[calendarField.key]);
  if (!at || !calendarId) return null;

  return { title: record.title, at, calendarId };
}

// Calendar itself is org-scoped ; a platform-wide Data Model (organizationId
// null) has no single org's calendar to materialize into, so it's skipped
// rather than guessed at.
async function syncRecord(
  dataModelId: string,
  recordId: string,
  organizationId: string | null,
): Promise<void> {
  if (!organizationId) return;
  const resolved = await resolveMaterialization(dataModelId, recordId);
  if (!resolved) {
    await softDeleteCalendarEventBySource(SOURCE_MODULE, recordId);
    return;
  }
  await upsertCalendarEventFromSource({
    sourceModule: SOURCE_MODULE,
    sourceRecordId: recordId,
    calendarId: resolved.calendarId,
    organizationId,
    title: resolved.title,
    at: resolved.at,
  });
}

let registered = false;

/**
 * Wires the calendar integration to the Data Models event bus. Listens for
 * `data-models.record-{created,updated,deleted}` and upserts / soft- or
 * hard-deletes the matching `CalendarEvent` (keyed on `sourceModule` +
 * `sourceRecordId`), so Calendar's own read paths (day view, reminders)
 * need zero changes to reflect Data Records — they just see more rows.
 *
 * Registered once at api boot from `services/api/src/server.ts`, after
 * `registerCalendarModelIntegration()` (the slot definitions must exist
 * before any admin can save a mapping, though this subscriber itself only
 * reads already-saved mappings so the ordering isn't strictly load-bearing).
 */
export function registerCalendarDataModelSubscriber(): void {
  if (registered) return;
  registered = true;

  on<DataModelRecordCreatedEvent>("data-models.record-created", async (event) => {
    try {
      await syncRecord(event.dataModelId, event.recordId, event.organizationId);
    } catch (err) {
      logger.error(
        { err, recordId: event.recordId },
        "calendar data-model materialization failed on record-created",
      );
    }
  });

  on<DataModelRecordUpdatedEvent>("data-models.record-updated", async (event) => {
    try {
      await syncRecord(event.dataModelId, event.recordId, event.organizationId);
    } catch (err) {
      logger.error(
        { err, recordId: event.recordId },
        "calendar data-model materialization failed on record-updated",
      );
    }
  });

  on<DataModelRecordDeletedEvent>("data-models.record-deleted", async (event) => {
    try {
      if (event.hard) {
        await hardDeleteCalendarEventBySource(SOURCE_MODULE, event.recordId);
      } else {
        await softDeleteCalendarEventBySource(SOURCE_MODULE, event.recordId);
      }
    } catch (err) {
      logger.error(
        { err, recordId: event.recordId },
        "calendar data-model materialization failed on record-deleted",
      );
    }
  });
}

export function _resetCalendarDataModelSubscriberForTesting(): void {
  registered = false;
}
