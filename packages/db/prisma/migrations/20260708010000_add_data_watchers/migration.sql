-- Record + model watchers (Notion-style "watch this page" / "subscribe to the
-- database"). A watcher is notified when the watched record/model changes.

CREATE TABLE "DataRecordWatcher" (
    "dataRecordId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "DataRecordWatcher_pkey" PRIMARY KEY ("dataRecordId", "userId")
);
CREATE INDEX "DataRecordWatcher_userId_idx" ON "DataRecordWatcher" ("userId");

CREATE TABLE "DataModelWatcher" (
    "dataModelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "DataModelWatcher_pkey" PRIMARY KEY ("dataModelId", "userId")
);
CREATE INDEX "DataModelWatcher_userId_idx" ON "DataModelWatcher" ("userId");

ALTER TABLE "DataRecordWatcher"
  ADD CONSTRAINT "DataRecordWatcher_dataRecordId_fkey"
  FOREIGN KEY ("dataRecordId") REFERENCES "DataRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRecordWatcher"
  ADD CONSTRAINT "DataRecordWatcher_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataModelWatcher"
  ADD CONSTRAINT "DataModelWatcher_dataModelId_fkey"
  FOREIGN KEY ("dataModelId") REFERENCES "DataModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataModelWatcher"
  ADD CONSTRAINT "DataModelWatcher_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
