import { logger, on } from "@monark/common";
import { getDb } from "@monark/db";
import { getUserRoles, hasPermission } from "@monark/rbac/server";
import { notify } from "@monark/notifications/server";
import type {
  DataModelRecordCreatedEvent,
  DataModelRecordDeletedEvent,
  DataModelRecordUpdatedEvent,
} from "../contracts/events";

/** Payload for the `data-models.record-changed` notification kind. */
type RecordChangedData = {
  recordTitle: string;
  modelName: string;
  action: string;
  actorName: string;
  link: string;
};

// The kind's payload would normally be typed via a NotificationDataRegistry
// augmentation, but that declaration merge doesn't survive a consumer package
// cross-compiling our source (TS drops the augmentation from a dependency
// file). We type the DATA explicitly here and pin the kind literal — the kind
// is registered at boot via registerDataModelsNotificationKinds() ; at runtime
// notify() only needs the string + the data, which this guarantees.
const notifyRecordChanged = notify as unknown as (
  kind: "data-models.record-changed",
  recipient: { userId: string },
  data: RecordChangedData,
) => Promise<unknown>;
import {
  findDataModelById,
  findDataRecordById,
  getDataRecordRoleAccess,
  isDataRecordRoleAccessible,
} from "./data";
import { listModelWatchers, listRecordWatchers } from "./watchers";

let registered = false;

type RecordEvent =
  | DataModelRecordCreatedEvent
  | DataModelRecordUpdatedEvent
  | DataModelRecordDeletedEvent;

const ACTION: Record<RecordEvent["type"], string> = {
  "data-models.record-created": "created",
  "data-models.record-updated": "updated",
  "data-models.record-deleted": "deleted",
};

/**
 * Fans a record change out to its watchers as an in-app notification.
 * Recipients = per-record watchers ∪ per-model watchers, minus the actor
 * (no self-notifications), minus anyone who can't see the record under
 * row-level access. Best-effort : a failure here never rolls back the
 * source mutation (it's already committed by the time the bus fires).
 */
export function registerDataModelRecordWatchSubscriber(): void {
  if (registered) return;
  registered = true;

  const types: RecordEvent["type"][] = [
    "data-models.record-created",
    "data-models.record-updated",
    "data-models.record-deleted",
  ];
  for (const type of types) {
    on(type, (event) => handle(event as RecordEvent));
  }
}

async function handle(event: RecordEvent): Promise<void> {
  try {
    const deleted = event.type === "data-models.record-deleted";
    const orgId = event.organizationId ?? undefined;

    // Recipients : record watchers + model watchers, minus the actor.
    const [recordWatchers, modelWatchers] = await Promise.all([
      listRecordWatchers(event.recordId),
      listModelWatchers(event.dataModelId),
    ]);
    const candidates = [...new Set([...recordWatchers, ...modelWatchers])].filter(
      (uid) => uid !== event.actorId,
    );
    if (candidates.length === 0) return;

    // Row-level access filter. Cheap path : an unrestricted record (no access
    // rows) is visible to every watcher, so skip the per-user checks. A hard-
    // deleted record has no rows left either → unrestricted, which is fine.
    let recipients = candidates;
    const restricted = (await getDataRecordRoleAccess(event.recordId)).length > 0;
    if (restricted && orgId) {
      recipients = [];
      for (const uid of candidates) {
        const [roles, bypass] = await Promise.all([
          getUserRoles(uid, orgId),
          hasPermission(uid, "data-models.manage-schema", orgId),
        ]);
        const ok = await isDataRecordRoleAccessible(event.recordId, {
          roleIds: roles.map((r) => r.id),
          bypass,
        });
        if (ok) recipients.push(uid);
      }
    }
    if (recipients.length === 0) return;

    const [model, record, actor] = await Promise.all([
      findDataModelById(event.dataModelId),
      deleted ? Promise.resolve(null) : findDataRecordById(event.recordId),
      getDb().user.findUnique({
        where: { id: event.actorId },
        select: { displayName: true, email: true },
      }),
    ]);

    const recordTitle = deleted
      ? (event as DataModelRecordDeletedEvent).recordTitle
      : (record?.title ?? "");
    const modelName = model?.name ?? "";
    const actorName = actor?.displayName || actor?.email || "someone";
    const link = deleted
      ? `/data/models/${event.dataModelKey}`
      : `/data/models/${event.dataModelKey}?record=${event.recordId}`;

    const data: RecordChangedData = {
      recordTitle,
      modelName,
      action: ACTION[event.type],
      actorName,
      link,
    };

    await Promise.all(
      recipients.map((userId) =>
        notifyRecordChanged("data-models.record-changed", { userId }, data),
      ),
    );
  } catch (err) {
    logger.error({ err, eventType: event.type }, "record-watch subscriber failed");
  }
}
