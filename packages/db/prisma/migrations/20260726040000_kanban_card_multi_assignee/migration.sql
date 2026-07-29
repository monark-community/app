-- Kanban cards support multiple assignees : replace the single nullable
-- `assigneeId` with an order-preserving `assigneeIds` text array. Existing
-- single assignees are carried over as a one-element array.
ALTER TABLE "KanbanCard" ADD COLUMN "assigneeIds" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "KanbanCard"
  SET "assigneeIds" = ARRAY["assigneeId"]
  WHERE "assigneeId" IS NOT NULL;

ALTER TABLE "KanbanCard" DROP COLUMN "assigneeId";
