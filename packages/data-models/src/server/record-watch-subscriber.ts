import { logger, on } from "@monark/common";
import { getDb } from "@monark/db";
import { getUserRoles, hasPermission } from "@monark/rbac/server";
import { notify } from "@monark/notifications/server";
import type {
  DataModelRecordCreatedEvent,
  DataModelRecordDeletedEvent,
  DataModelRecordUpdatedEvent,
  DataRecordCommentedEvent,
} from "../contracts/events";

/** Payload for the `data-models.record-changed` notification kind. */
type RecordChangedData = {
  recordTitle: string;
  modelName: string;
  action: string;
  actorName: string;
  link: string;
};

/** Payload for the `data-models.record-commented` notification kind. */
type RecordCommentedData = {
  recordTitle: string;
  modelName: string;
  authorName: string;
  snippet: string;
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
const notifyRecordCommented = notify as unknown as (
  kind: "data-models.record-commented",
  recipient: { userId: string },
  data: RecordCommentedData,
) => Promise<unknown>;
import {
  findDataModelById,
  findDataRecordById,
  getDataRecordRoleAccess,
  isDataRecordRoleAccessible,
} from "./data";
import { getCommentById } from "./engagement";
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
  on("data-models.record-commented", (event) => handleCommented(event as DataRecordCommentedEvent));
}

// Recipients for a record event : record watchers ∪ model watchers, minus the
// actor, minus anyone who can't see the record under row-level access. The
// cheap path (an unrestricted record with no access rows) skips per-user checks.
async function accessibleWatchers(
  recordId: string,
  dataModelId: string,
  excludeUserId: string,
  orgId?: string,
): Promise<string[]> {
  const [recordWatchers, modelWatchers] = await Promise.all([
    listRecordWatchers(recordId),
    listModelWatchers(dataModelId),
  ]);
  const candidates = [...new Set([...recordWatchers, ...modelWatchers])].filter(
    (uid) => uid !== excludeUserId,
  );
  if (candidates.length === 0) return [];
  const restricted = (await getDataRecordRoleAccess(recordId)).length > 0;
  if (!restricted || !orgId) return candidates;
  const recipients: string[] = [];
  for (const uid of candidates) {
    const [roles, bypass] = await Promise.all([
      getUserRoles(uid, orgId),
      hasPermission(uid, "data-models.manage-schema", orgId),
    ]);
    const ok = await isDataRecordRoleAccessible(recordId, {
      roleIds: roles.map((r) => r.id),
      bypass,
    });
    if (ok) recipients.push(uid);
  }
  return recipients;
}

async function handle(event: RecordEvent): Promise<void> {
  try {
    const deleted = event.type === "data-models.record-deleted";
    const orgId = event.organizationId ?? undefined;

    const recipients = await accessibleWatchers(
      event.recordId,
      event.dataModelId,
      event.actorId,
      orgId,
    );
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

// A comment fans out to the record's watchers (minus the author), same
// row-level-access rules as record changes. Best-effort ; the comment is
// already committed.
async function handleCommented(event: DataRecordCommentedEvent): Promise<void> {
  try {
    const orgId = event.organizationId ?? undefined;
    const recipients = await accessibleWatchers(
      event.recordId,
      event.dataModelId,
      event.authorId,
      orgId,
    );
    if (recipients.length === 0) return;

    const [model, record, comment, author] = await Promise.all([
      findDataModelById(event.dataModelId),
      findDataRecordById(event.recordId),
      getCommentById(event.commentId),
      getDb().user.findUnique({
        where: { id: event.authorId },
        select: { displayName: true, email: true },
      }),
    ]);

    const body = comment?.body ?? "";
    const snippet = body.length > 120 ? `${body.slice(0, 117)}...` : body;
    const data: RecordCommentedData = {
      recordTitle: record?.title ?? "",
      modelName: model?.name ?? "",
      authorName: author?.displayName || author?.email || "someone",
      snippet,
      link: `/data/models/${event.dataModelKey}?record=${event.recordId}`,
    };

    await Promise.all(
      recipients.map((userId) =>
        notifyRecordCommented("data-models.record-commented", { userId }, data),
      ),
    );
  } catch (err) {
    logger.error({ err, eventType: event.type }, "record-comment subscriber failed");
  }
}
