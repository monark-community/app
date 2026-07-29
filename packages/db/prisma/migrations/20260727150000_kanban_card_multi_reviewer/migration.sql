-- Kanban cards support multiple reviewers : replace the single nullable
-- `reviewerId` with an order-preserving `reviewerIds` text array. Existing
-- single reviewers are carried over as a one-element array.
ALTER TABLE "KanbanCard" ADD COLUMN "reviewerIds" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "KanbanCard"
  SET "reviewerIds" = ARRAY["reviewerId"]
  WHERE "reviewerId" IS NOT NULL;

ALTER TABLE "KanbanCard" DROP COLUMN "reviewerId";
