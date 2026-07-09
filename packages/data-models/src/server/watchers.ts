import { getDb } from "@monark/db";

// Watch state for records + models. A "watch" row means the user is notified
// when the watched record (or any record in the watched model) changes. Both
// are simple (subject, user) join tables ; the notification fan-out + access
// filtering lives in the record-watch subscriber.

// ── Per-record ──

export async function setRecordWatch(
  recordId: string,
  userId: string,
  watching: boolean,
): Promise<void> {
  const db = getDb();
  if (watching) {
    await db.dataRecordWatcher.upsert({
      where: { dataRecordId_userId: { dataRecordId: recordId, userId } },
      create: { dataRecordId: recordId, userId },
      update: {},
    });
  } else {
    await db.dataRecordWatcher.deleteMany({ where: { dataRecordId: recordId, userId } });
  }
}

export async function isWatchingRecord(recordId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const row = await db.dataRecordWatcher.findUnique({
    where: { dataRecordId_userId: { dataRecordId: recordId, userId } },
    select: { userId: true },
  });
  return row !== null;
}

export async function listRecordWatchers(recordId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.dataRecordWatcher.findMany({
    where: { dataRecordId: recordId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

// ── Per-model ──

export async function setModelWatch(
  modelId: string,
  userId: string,
  watching: boolean,
): Promise<void> {
  const db = getDb();
  if (watching) {
    await db.dataModelWatcher.upsert({
      where: { dataModelId_userId: { dataModelId: modelId, userId } },
      create: { dataModelId: modelId, userId },
      update: {},
    });
  } else {
    await db.dataModelWatcher.deleteMany({ where: { dataModelId: modelId, userId } });
  }
}

export async function isWatchingModel(modelId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const row = await db.dataModelWatcher.findUnique({
    where: { dataModelId_userId: { dataModelId: modelId, userId } },
    select: { userId: true },
  });
  return row !== null;
}

export async function listModelWatchers(modelId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.dataModelWatcher.findMany({
    where: { dataModelId: modelId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}
