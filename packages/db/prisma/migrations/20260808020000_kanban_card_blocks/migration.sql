-- Kanban card body becomes a BlockNote block array (JSONB) plus a derived
-- plain-text projection (`descriptionText`) so the query language keeps
-- filtering on the description text. Pre-release : existing HTML descriptions
-- are RESET TO EMPTY rather than converted (see
-- docs/features-planning/proposed/block-editor.md, "No content backfill").

-- AlterTable
ALTER TABLE "KanbanCard" ADD COLUMN "descriptionText" TEXT NOT NULL DEFAULT '';

-- String? -> non-null JSONB defaulting to an empty block array. `USING '[]'`
-- resets every existing row (HTML or NULL) to '[]', which is non-null, so the
-- subsequent SET NOT NULL is safe.
ALTER TABLE "KanbanCard" ALTER COLUMN "description" TYPE JSONB USING '[]'::jsonb;
ALTER TABLE "KanbanCard" ALTER COLUMN "description" SET DEFAULT '[]';
ALTER TABLE "KanbanCard" ALTER COLUMN "description" SET NOT NULL;
